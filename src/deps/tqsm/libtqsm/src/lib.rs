use anyhow::{bail, Result};
use once_cell::sync::Lazy;
use regex::{Match, Matches, Regex};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use unicode_segmentation::UnicodeSegmentation;

mod languages;
use languages::SUPPORTED_LANGUAGES;

mod constants;
pub(crate) use constants::{
    GLOBAL_SENTENCE_TERMINATORS, LANGDATA_STR, LANGUAGE_FALLBACKS, QUOTE_PAIRS_ARRAY,
};

pub static LANGUAGE_REGISTRY: Lazy<HashMap<&'static str, &(dyn Language + Send + Sync + 'static)>> =
    Lazy::new(|| {
        SUPPORTED_LANGUAGES
            .into_iter()
            .map(|l| (l.language_code(), l))
            .collect()
    });
static LANGDATA: Lazy<HashMap<&'static str, LanguageData>> =
    Lazy::new(|| serde_json::from_str(LANGDATA_STR).unwrap());
static QUOTE_PAIRS_REGEX: Lazy<Regex> = Lazy::new(|| {
    let quotes_regx_str = QUOTE_PAIRS_ARRAY
        .into_iter()
        .map(|(left, right)| format!(r"{}(\n|.)*?{}", left, right))
        .collect::<Vec<String>>()
        .join("|");
    Regex::new(&quotes_regx_str).unwrap()
});
static PARENS_REGEX: Lazy<fancy_regex::Regex> =
    Lazy::new(|| fancy_regex::Regex::new(r"([\(（<{\[])(?:\\\1|.)*?[\)\]}）]").unwrap());
static EMAIL_REGEX: Lazy<Regex> = Lazy::new(|| {
    let email_regex_str = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}";
    Regex::new(email_regex_str).unwrap()
});
static CONSECUTIVE_NEWLINES_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"(\n{2,})").unwrap());
static NUMBERED_REFERENCE_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(\[\d+])+").unwrap());
pub(crate) static WORD_SPLIT_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"[\s\.]+").unwrap());
static GLOBAL_SENTENCE_BOUNDARY_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"[{}]+",
        String::from_iter(GLOBAL_SENTENCE_TERMINATORS)
    ))
    .unwrap()
});

pub fn segment(lang_code: &str, text: &str) -> Result<Vec<String>> {
    let language = match get_language(lang_code) {
        Some(language) => language,
        None => bail!("Language `{}` not supported", lang_code),
    };
    Ok(language.segment(text))
}

fn get_language(lang_code: &str) -> Option<&(dyn Language + Send + Sync + 'static)> {
    let mut ret_lang = LANGUAGE_REGISTRY.get(lang_code).copied();
    if ret_lang.is_none() {
        let fallbacks = LANGUAGE_FALLBACKS
            .get(lang_code)
            .cloned()
            .unwrap_or(["en"].to_vec());
        for fallback_language in fallbacks {
            ret_lang = get_language(fallback_language);
            if ret_lang.is_some() {
                break;
            }
        }
    }
    ret_lang
}

#[derive(Clone, Deserialize, Default)]
struct LanguageData {
    abbreviation_char: &'static str,
    abbreviations: HashSet<&'static str>,
    exclamation_words: HashSet<&'static str>,
}

pub struct GraphemeCursor {
    grapheme_offsets: Vec<usize>,
}

impl GraphemeCursor {
    fn next_grapheme(&self, pos: usize) -> Option<usize> {
        self.grapheme_offsets.iter().find(|p| **p > pos).copied()
    }
    #[allow(dead_code)]
    fn prev_grapheme(&self, pos: usize) -> Option<usize> {
        self.grapheme_offsets
            .iter()
            .rev()
            .find(|p| **p < pos)
            .copied()
    }
}

pub trait Language {
    fn language_code(&self) -> &'static str;

    fn quote_pairs_regex(&self) -> &'static Regex {
        &QUOTE_PAIRS_REGEX
    }
    fn numbered_reference_regex(&self) -> &Regex {
        &NUMBERED_REFERENCE_REGEX
    }
    fn sentence_break_regex(&self) -> &Regex {
        &GLOBAL_SENTENCE_BOUNDARY_REGEX
    }
    fn get_lastword<'a>(&'a self, text: &'a str) -> Option<&'a str> {
        WORD_SPLIT_REGEX.split(text).last()
    }

    fn find_boundary<'a>(
        &self,
        text: &'a str,
        grapheme_indices: &HashMap<usize, &str>,
        cursor: &GraphemeCursor,
        mtch: Match<'a>,
    ) -> Option<(usize, bool)> {
        let (match_start, match_end) = (mtch.start(), mtch.end());
        let next_char_offset = cursor.next_grapheme(match_start)?;
        let tail = &text[next_char_offset..];
        let head = &text[..match_start];

        let number_ref_match = self.numbered_reference_regex().find(tail);

        if let Some(number_ref_match) = number_ref_match {
            let ref_num_end = mtch.end() + number_ref_match.end();
            let ref_num_end = cursor.next_grapheme(ref_num_end).unwrap_or(ref_num_end);
            return Some((ref_num_end, true));
        }

        if self.continue_in_next_word(tail) {
            return None;
        }

        if self.is_abbreviation(head, tail, grapheme_indices[&match_start]) {
            return None;
        }

        if self.is_exclamation_word(head, tail) {
            return None;
        }

        Some((match_end, false))
    }

    fn continue_in_next_word(&self, text_after_boundary: &str) -> bool {
        text_after_boundary
            .chars()
            .next()
            .map_or(false, |c| c.is_ascii_lowercase() || c.is_ascii_digit())
    }

    fn get_skippable_ranges(&self, text: &str) -> Vec<(usize, usize)> {
        let mut bounds = Vec::from_iter(
            self.quote_pairs_regex()
                .find_iter(text)
                .chain(EMAIL_REGEX.find_iter(text))
                .map(|m| (m.start(), m.end())),
        );
        for m in PARENS_REGEX.find_iter(text).flatten() {
            bounds.push((m.start(), m.end()))
        }
        bounds
    }

    fn segment(&self, text: &str) -> Vec<String> {
        let mut sentences = Vec::new();

        for paragraph in CONSECUTIVE_NEWLINES_REGEX.split_inclusive(text) {
            let grapheme_indices: HashMap<usize, &str> =
                paragraph.grapheme_indices(false).collect();
            let mut grapheme_offsets: Vec<usize> = grapheme_indices.keys().copied().collect();
            grapheme_offsets.sort_unstable();
            let cursor = GraphemeCursor { grapheme_offsets };

            let mut boundaries = vec![0];
            let skippable_ranges = self.get_skippable_ranges(paragraph);

            for mtch in self.sentence_break_regex().find_iter(paragraph) {
                if let Some((mut boundary, is_num_ref)) =
                    self.find_boundary(paragraph, &grapheme_indices, &cursor, mtch)
                {
                    let mut in_range = false;
                    if is_num_ref {
                        boundaries.push(boundary);
                        continue;
                    }
                    'skip_ranges: for (qstart, qend) in skippable_ranges.iter() {
                        let next_grapheme = cursor.next_grapheme(boundary).unwrap_or(boundary);
                        if (boundary > *qstart) && (boundary < *qend) {
                            if (next_grapheme == *qend) && self.is_punctuation_between_quotes() {
                                boundary = *qend;
                                in_range = false;
                            } else {
                                in_range = true;
                            }
                            break 'skip_ranges;
                        }
                    }
                    if in_range {
                        continue;
                    }

                    boundaries.push(boundary);
                }
            }

            for (i, j) in boundaries.iter().zip(
                boundaries
                    .iter()
                    .skip(1)
                    .chain(std::iter::once(&paragraph.len())),
            ) {
                let sentence = &paragraph[*i..*j];
                if !sentence.is_empty() {
                    sentences.push(sentence.trim_matches(' ').to_string());
                }
            }
        }

        sentences
    }

    fn is_punctuation_between_quotes(&self) -> bool {
        false
    }
    fn is_abbreviation(&self, head: &str, _tail: &str, separator: &str) -> bool {
        if self.abbreviation_char() != separator {
            return false;
        }

        let last_word = match self.get_lastword(head) {
            Some(word) => word,
            None => return false,
        };

        if last_word.is_empty() {
            return false;
        }

        let normalized_last_word = {
            let mut out = String::with_capacity(last_word.len());
            let mut graphemes = last_word.graphemes(false);
            out.push_str(&graphemes.next().unwrap().to_lowercase());
            out.extend(graphemes);
            out
        };
        let is_abbrev = self.abbreviations().contains(last_word)
            || self.abbreviations().contains(normalized_last_word.as_str())
            || self
                .abbreviations()
                .contains(last_word.to_lowercase().as_str())
            || self
                .abbreviations()
                .contains(last_word.to_uppercase().as_str());

        is_abbrev
    }
    fn is_exclamation_word(&self, head: &str, _tail: &str) -> bool {
        let last_word = match self.get_lastword(head) {
            Some(word) => word,
            None => return false,
        };
        self.exclamation_words()
            .contains(format!("{}!", last_word).as_str())
    }
    fn abbreviation_char(&self) -> &'static str {
        LANGDATA[self.language_code()].abbreviation_char
    }
    fn abbreviations(&self) -> &'static HashSet<&'static str> {
        &(LANGDATA[self.language_code()].abbreviations)
    }
    fn exclamation_words(&self) -> &'static HashSet<&'static str> {
        &(LANGDATA[self.language_code()].exclamation_words)
    }
}

struct RegexSplitInclusive<'r, 's> {
    matches: Matches<'r, 's>,
    remaining: &'s str,
    pending_separator: Option<&'s str>,
}

impl<'r, 's> RegexSplitInclusive<'r, 's> {
    fn new(reg: &'r Regex, text: &'s str) -> Self {
        Self {
            matches: reg.find_iter(text),
            remaining: text,
            pending_separator: None,
        }
    }
}

impl<'r, 's> std::iter::Iterator for RegexSplitInclusive<'r, 's> {
    type Item = &'s str;

    fn next(&mut self) -> Option<Self::Item> {
        let m = match self.matches.next() {
            Some(m) => m,
            None => {
                if let Some(ps) = self.pending_separator.take() {
                    return Some(ps);
                }
                if !self.remaining.is_empty() {
                    let retval = self.remaining;
                    self.remaining = "";
                    return Some(retval);
                } else {
                    return None;
                }
            }
        };
        let retval = &self.remaining[..m.start()];
        self.remaining = &self.remaining[m.end()..];
        self.pending_separator = Some(m.as_str());
        Some(retval)
    }
}

trait RegexSplitInclusiveTrait {
    fn split_inclusive<'r, 's>(&'r self, text: &'s str) -> RegexSplitInclusive<'r, 's>;
}

impl RegexSplitInclusiveTrait for Regex {
    fn split_inclusive<'r, 's>(&'r self, text: &'s str) -> RegexSplitInclusive<'r, 's> {
        RegexSplitInclusive::new(self, text)
    }
}
#[cfg(test)]
mod test {
    use super::*;
    use anyhow::Result;

    #[test]
    fn test_basics() -> Result<()> {
        let sents = segment("en", "This is Dr. Watson. Thanks for having me!")?;
        println!("{}", sents.join("\n"));
        let sents = segment("en", "Roses Are Red. Violets Are Blue!")?;
        println!("{}", sents.join("\n"));
        let sents = segment("ar", "هذا هو د. سالم. ماذا تقدمون للعشاء اليوم؟")?;
        println!("{}", sents.join("\n"));
        let sents = segment(
            "ru", "Шухов как был в ватных брюках, не снятых на ночь (повыше левого колена их тоже был пришит затасканный, погрязневший лоскут, и на нем выведен черной, уже поблекшей краской номер Щ-854), надел телогрейку…"
        )?;
        println!("{}", sents.join("\n"));

        let sents = segment("en", "I work for the U.S. Government in Virginia.")?;
        println!("{}", sents.join("\n"));
        assert_eq!(sents.len(), 1);

        let sents = segment("en", "He teaches science (He previously worked for 5 years as an engineer.) at the local University")?;
        println!("{}", sents.join("\n"));
        assert_eq!(sents.len(), 1);

        let sents = segment("en", "Thus increasing the desire for political reform both in Lancashire and in the country at large.[7][8] This was a serious misdemeanour,[16] encouraging them to declare the assembly illegal as soon as it was announced on 31 July.[17][18] The radicals sought a second opinion on the meeting's legality.")?;
        println!("{}", sents.join("\n"));
        assert_eq!(sents.len(), 3);

        Ok(())
    }
    #[test]
    fn test_fr() -> Result<()> {
        let sents = segment("fr", "Après avoir été l'un des acteurs du projet génome humain, le Genoscope met aujourd'hui le cap vers la génomique environnementale. L'exploitation des données de séquences, prolongée par l'identification expérimentale des fonctions biologiques, notamment dans le domaine de la biocatalyse, ouvrent des perspectives de développements en biotechnologie industrielle.")?;
        assert_eq!(sents.len(), 2);
        Ok(())
    }
    #[test]
    fn test_it_can_find_zh() -> Result<()> {
        let sents = segment("zh", "安永已聯繫周怡安親屬，協助辦理簽證相關事宜，周怡安家屬1月1日晚間搭乘東方航空班機抵達上海，他們步入入境大廳時 神情落寞、不發一語。周怡安來自台中，去年剛從元智大學畢業，同年9月加入安永。")?;
        assert_eq!(sents.len(), 2);
        Ok(())
    }
    #[test]
    fn test_regex_split_inclusive() {
        let single_line: Vec<&str> = CONSECUTIVE_NEWLINES_REGEX
            .split_inclusive("This is just a single sentence")
            .collect();
        assert!(!single_line.is_empty());
        assert!(!single_line[0].is_empty());
        let two_lines_no_split: Vec<&str> = CONSECUTIVE_NEWLINES_REGEX
            .split_inclusive("First line\nSecond line\n")
            .collect();
        assert_eq!(two_lines_no_split.len(), 1);
        let two_lines_with_split: Vec<&str> = CONSECUTIVE_NEWLINES_REGEX
            .split_inclusive("First line\n\nSecond line")
            .collect();
        assert_eq!(two_lines_with_split.len(), 3);
    }
}
