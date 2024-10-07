#![feature(ptr_sub_ptr)]
#![feature(str_lines_remainder)]

mod espeakng;

use ffi_support::{rust_string_to_c, FfiStr};
use once_cell::sync::Lazy;
use regex::Regex;
use std::error::Error;
use std::ffi;
use std::fmt;

pub type ESpeakResult<T> = Result<T, ESpeakError>;

const CLAUSE_INTONATION_FULL_STOP: i32 = 0x00000000;
const CLAUSE_INTONATION_COMMA: i32 = 0x00001000;
const CLAUSE_INTONATION_QUESTION: i32 = 0x00002000;
const CLAUSE_INTONATION_EXCLAMATION: i32 = 0x00003000;
const CLAUSE_TYPE_SENTENCE: i32 = 0x00080000;

#[derive(Debug, Clone)]
pub struct ESpeakError(pub String);

impl Error for ESpeakError {}

impl fmt::Display for ESpeakError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "eSpeak-ng Error :{}", self.0)
    }
}

static LANG_SWITCH_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"\([^)]*\)").unwrap());
static STRESS_PATTERN: Lazy<Regex> = Lazy::new(|| Regex::new(r"[ˈˌ]").unwrap());
static ESPEAKNG_INIT: Lazy<ESpeakResult<()>> = Lazy::new(|| unsafe {
    let es_sample_rate = espeakng::espeak_Initialize(
        espeakng::espeak_AUDIO_OUTPUT_AUDIO_OUTPUT_RETRIEVAL,
        0,
        std::ptr::null(),
        espeakng::espeakINITIALIZE_DONT_EXIT as i32,
    );
    if es_sample_rate <= 0 {
        Err(ESpeakError(format!(
                "Failed to initialize eSpeak-ng. Try setting `ESPEAK_DATA_PATH` environment variable to the directory that contains the `espeak-ng-data` directory.",
            )))
    } else {
        Ok(())
    }
});

pub fn text_to_phonemes(
    text: &str,
    language: &str,
    is_ssml: bool,
    phoneme_separator: Option<char>,
    remove_lang_switch_flags: bool,
    remove_stress: bool,
) -> ESpeakResult<Vec<(usize, usize, String)>> {
    let mut phonemes = Vec::new();
    let total_length = text.len();
    let mut offset = 0;
    let mut lines = text.lines();
    while let Some(line) = lines.next() {
        phonemes.append(&mut _text_to_phonemes(
            line,
            offset,
            language,
            is_ssml,
            phoneme_separator,
            remove_lang_switch_flags,
            remove_stress,
        )?);
        offset = total_length - lines.remainder().unwrap_or_default().len()
    }
    Ok(phonemes)
}

pub fn _text_to_phonemes(
    text: &str,
    text_offset: usize,
    language: &str,
    is_ssml: bool,
    phoneme_separator: Option<char>,
    remove_lang_switch_flags: bool,
    remove_stress: bool,
) -> ESpeakResult<Vec<(usize, usize, String)>> {
    if let Err(ref e) = Lazy::force(&ESPEAKNG_INIT) {
        return Err(e.clone());
    }
    let set_voice_res = unsafe { espeakng::espeak_SetVoiceByName(rust_string_to_c(language)) };
    if set_voice_res != espeakng::espeak_ERROR_EE_OK {
        return Err(ESpeakError(format!(
            "Failed to set eSpeak-ng voice to: `{}` ",
            language
        )));
    }
    let calculated_phoneme_mode = match phoneme_separator {
        Some(c) => ((c as u32) << 8u32) | espeakng::espeakINITIALIZE_PHONEME_IPA,
        None => espeakng::espeakINITIALIZE_PHONEME_IPA,
    };
    let phoneme_mode: i32 = calculated_phoneme_mode.try_into().unwrap();
    let text_mode = if is_ssml {
        espeakng::espeakCHARS_UTF8 | espeakng::espeakSSML
    } else {
        espeakng::espeakCHARS_UTF8
    };
    let mut sent_phonemes = Vec::new();
    let mut phonemes = String::new();
    let mut text_c_char = rust_string_to_c(text) as *const ffi::c_char;
    let mut text_c_char_prev = text_c_char;
    let mut terminator: ffi::c_int = 0;
    let terminator_ptr: *mut ffi::c_int = &mut terminator;
    let mut start = text_offset;
    let mut end: usize = text_offset;

    let re = regex::Regex::new(r"\b").unwrap();
    let mut word_boundaries = vec![false; text.len() + 1];
    for m in re.find_iter(text) {
        word_boundaries[m.start()] = true;
    }

    while !text_c_char.is_null() {
        let text_c_char_ptr = std::ptr::addr_of_mut!(text_c_char);
        let ph_str = unsafe {
            let res = espeakng::espeak_TextToPhonemesWithTerminator(
                text_c_char_ptr,
                text_mode,
                phoneme_mode,
                terminator_ptr,
            );
            FfiStr::from_raw(res)
        };

        let ph_string = &ph_str.into_string();
        phonemes.push_str(ph_string);
        let intonation = terminator & 0x0000F000;
        if intonation == CLAUSE_INTONATION_FULL_STOP {
            phonemes.push('.');
        } else if intonation == CLAUSE_INTONATION_COMMA {
            phonemes.push(',');
        } else if intonation == CLAUSE_INTONATION_QUESTION {
            phonemes.push('?');
        } else if intonation == CLAUSE_INTONATION_EXCLAMATION {
            phonemes.push('!');
        }
        if (terminator & CLAUSE_TYPE_SENTENCE) == CLAUSE_TYPE_SENTENCE {
            start = end;
            end = if !text_c_char.is_null() {
                unsafe {
                    // text_c_char = text_c_char.sub(1);
                    text_c_char.sub_ptr(text_c_char_prev) + start
                }
            } else {
                text.len()
            } + text_offset
                - 1;
            while !word_boundaries.get(start).unwrap_or(&true) && start < end {
                start += 1;
            }

            while !word_boundaries.get(end).unwrap_or(&true) {
                end += 1;
            }
            sent_phonemes.push((start, end, std::mem::take(&mut phonemes)));
            text_c_char_prev = text_c_char;
        }
    }
    if !phonemes.is_empty() {
        sent_phonemes.push((start, end, std::mem::take(&mut phonemes)));
    }
    if remove_lang_switch_flags {
        sent_phonemes = Vec::from_iter(sent_phonemes.into_iter().map(|(start, end, phonemes)| {
            (
                start,
                end,
                LANG_SWITCH_PATTERN.replace_all(&phonemes, "").into_owned(),
            )
        }));
    }
    if remove_stress {
        sent_phonemes = Vec::from_iter(sent_phonemes.into_iter().map(|(start, end, phonemes)| {
            (
                start,
                end,
                STRESS_PATTERN.replace_all(&phonemes, "").into_owned(),
            )
        }));
    }
    Ok(sent_phonemes)
}

// ==============================

#[cfg(test)]
mod tests {
    use super::*;

    const TEXT_ALICE: &str =
        "Who are you? said the Caterpillar. Replied Alice , rather shyly, I hardly know, sir!";

    #[test]
    fn test_basic_en() -> ESpeakResult<()> {
        let text = "test";
        let expected = "tˈɛst.";
        let phonemes = text_to_phonemes(text, "en-US", false, None, false, false)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        assert_eq!(phonemes, expected);
        Ok(())
    }

    #[test]
    fn test_it_splits_sentences() -> ESpeakResult<()> {
        let phonemes_data = text_to_phonemes(TEXT_ALICE, "en-US", false, None, false, false)?;
        println!("{:?}", phonemes_data);
        assert_eq!(phonemes_data.len(), 3);
        assert_eq!(phonemes_data[0], (0, 13, "hˈuː ɑːɹ juː?".to_string()));
        assert_eq!(
            phonemes_data[1],
            (13, 35, "sˈɛd ðə kˈæɾɚpˌɪlɚ.".to_string())
        );
        assert_eq!(
            phonemes_data[2],
            (
                35,
                83,
                "ɹᵻplˈaɪd ˈælɪs,ɹˈæðɚ ʃˈaɪli,aɪ hˈɑːɹdli nˈoʊ,sˌɜː!".to_string()
            )
        );
        Ok(())
    }

    #[test]
    fn test_it_adds_phoneme_separator() -> ESpeakResult<()> {
        let text = "test";
        let expected = "t_ˈɛ_s_t.";
        let phonemes = text_to_phonemes(text, "en-US", false, Some('_'), false, false)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        assert_eq!(phonemes, expected);
        Ok(())
    }

    #[test]
    fn test_it_preserves_clause_breakers() -> ESpeakResult<()> {
        let phonemes = text_to_phonemes(TEXT_ALICE, "en-US", false, None, false, false)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        let clause_breakers = ['.', ',', '?', '!'];
        for c in clause_breakers {
            assert_eq!(
                phonemes.contains(c),
                true,
                "Clause breaker `{}` not preserved",
                c
            );
        }
        Ok(())
    }

    #[test]
    fn test_arabic() -> ESpeakResult<()> {
        let text = "مَرْحَبَاً بِكَ أَيُّهَا الْرَّجُلْ";
        let expected = "mˈarħabˌaː bikˌa ʔaˈiːuhˌaː alrrˈadʒul.";
        let phonemes = text_to_phonemes(text, "ar", false, None, false, false)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        assert_eq!(phonemes, expected);
        Ok(())
    }

    #[test]
    fn test_lang_switch_flags() -> ESpeakResult<()> {
        let text = "Hello معناها مرحباً";

        let with_lang_switch = text_to_phonemes(text, "ar", false, None, false, false)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        assert_eq!(with_lang_switch.contains("(en)"), true);
        assert_eq!(with_lang_switch.contains("(ar)"), true);

        let without_lang_switch = text_to_phonemes(text, "ar", false, None, true, false)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        assert_eq!(without_lang_switch.contains("(en)"), false);
        assert_eq!(without_lang_switch.contains("(ar)"), false);

        Ok(())
    }

    #[test]
    fn test_stress() -> ESpeakResult<()> {
        let stress_markers = ['ˈ', 'ˌ'];

        let with_stress = text_to_phonemes(TEXT_ALICE, "en-US", false, None, false, false)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        assert_eq!(with_stress.contains(stress_markers), true);

        let without_stress = text_to_phonemes(TEXT_ALICE, "en-US", false, None, false, true)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        assert_eq!(without_stress.contains(stress_markers), false);

        Ok(())
    }

    #[test]
    fn test_line_splitting() -> ESpeakResult<()> {
        let text = "Hello\nThere I love you. Say goodbye when you leave.\nAnd\nWelcome";
        let phoneme_paragraphs = text_to_phonemes(text, "en-US", false, None, false, false)?;
        println!("{:?}", phoneme_paragraphs);

        assert_eq!(phoneme_paragraphs.len(), 5);
        assert_eq!(phoneme_paragraphs[0], (0, 5, "həlˈoʊ.".to_string()));
        assert_eq!(
            phoneme_paragraphs[1],
            (6, 30, "ðɛɹ aɪ lˈʌv juː.".to_string())
        );
        assert_eq!(
            phoneme_paragraphs[2],
            (30, 50, "sˈeɪ ɡʊdbˈaɪ wɛn juː lˈiːv.".to_string())
        );
        assert_eq!(phoneme_paragraphs[3], (52, 54, "ænd.".to_string()));
        assert_eq!(phoneme_paragraphs[4], (56, 62, "wˈɛlkʌm.".to_string()));
        Ok(())
    }

    #[test]
    fn test_ssml() -> ESpeakResult<()> {
        let text = "<say-as interpret-as='characters'>hello world</say-as>";
        let expected = "ˌeɪtʃˌiːˈɛlˌɛlˈoʊ dˌʌbəljˌuːˌoʊˈɑːɹˌɛldˈiː.";
        let phonemes = text_to_phonemes(text, "en-US", true, None, false, false)?
            .into_iter()
            .map(|(_start, _end, p)| p)
            .collect::<Vec<String>>()
            .join("");
        assert_eq!(phonemes, expected);
        Ok(())
    }
}
