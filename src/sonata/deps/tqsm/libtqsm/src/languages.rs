use crate::{Language, GLOBAL_SENTENCE_TERMINATORS, WORD_SPLIT_REGEX};
use once_cell::sync::Lazy;
use regex::Regex;
use unicode_segmentation::UnicodeSegmentation;

const N_BASE_LANGUAGES: usize = 30;
pub(crate) const SUPPORTED_LANGUAGES: [&(dyn Language + Send + Sync + 'static); N_BASE_LANGUAGES] = [
    &AmLanguage,
    &ArLanguage,
    &BgLanguage,
    &BnLanguage,
    &CaLanguage,
    &EnLanguage,
    &ElLanguage,
    &DaLanguage,
    &DeLanguage,
    &EsLanguage,
    &FiLanguage,
    &FrLanguage,
    &GuLanguage,
    &HiLanguage,
    &HyLanguage,
    &ItLanguage,
    &KkLanguage,
    &KnLanguage,
    &MlLanguage,
    &MrLanguage,
    &MyLanguage,
    &NlLanguage,
    &OrLanguage,
    &PaLanguage,
    &SkLanguage,
    &PlLanguage,
    &PtLanguage,
    &RuLanguage,
    &TaLanguage,
    &TeLanguage,
];
const DE_MONTHS: [&str; 12] = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
];
const FI_MONTHS: [&str; 12] = [
    "tammikuu",
    "helmikuu",
    "maaliskuu",
    "huhtikuu",
    "toukokuu",
    "kesäkuu",
    "heinäkuu",
    "elokuu",
    "syyskuu",
    "lokakuu",
    "marraskuu",
    "joulukuu",
];
const SK_MONTHS: [&str; 24] = [
    "Január",
    "Február",
    "Marec",
    "Apríl",
    "Máj",
    "Jún",
    "Júl",
    "August",
    "September",
    "Október",
    "November",
    "December",
    "Januára",
    "Februára",
    "Marca",
    "Apríla",
    "Mája",
    "Júna",
    "Júla",
    "Augusta",
    "Septembra",
    "Októbra",
    "Novembra",
    "Decembra",
];
static RU_CNW: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[0-9a-zа-я]").unwrap());
static CNW_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\W*[0-9a-z]").unwrap());
static KK_CNW_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\W*[0-9a-zа-я]").unwrap());
static EL_SENTENCE_BOUNDARY_REGEX: Lazy<Regex> = Lazy::new(|| {
    let regex_str = format!(
        r"[{}]+",
        String::from_iter(
            GLOBAL_SENTENCE_TERMINATORS
                .into_iter()
                .chain(std::iter::once(';'))
        )
    );
    Regex::new(&regex_str).unwrap()
});
static HY_SENTENCE_BOUNDARY_REGEX: Lazy<Regex> = Lazy::new(|| {
    let regex_str = format!(
        r"[{}]+",
        String::from_iter(
            GLOBAL_SENTENCE_TERMINATORS
                .into_iter()
                .filter(|c| *c != '.')
                .chain(['։', '՜', ':'].into_iter())
        )
    );
    Regex::new(&regex_str).unwrap()
});
static MY_SENTENCE_BOUNDARY_REGEX: Lazy<Regex> = Lazy::new(|| {
    let regex_str = format!(
        r"[{}]+",
        String::from_iter(
            GLOBAL_SENTENCE_TERMINATORS
                .into_iter()
                .chain(std::iter::once('၏'))
        )
    );
    Regex::new(&regex_str).unwrap()
});

fn to_title_case(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut graphemes = text.graphemes(false);
    out.push_str(&graphemes.next().unwrap_or("").to_uppercase());
    out.extend(graphemes);
    out
}

#[derive(Clone, Default)]
pub(crate) struct AmLanguage;
impl Language for AmLanguage {
    fn language_code(&self) -> &'static str {
        "am"
    }
}

#[derive(Clone, Default)]
pub(crate) struct ArLanguage;
impl Language for ArLanguage {
    fn language_code(&self) -> &'static str {
        "ar"
    }
}

#[derive(Clone, Default)]
pub(crate) struct BgLanguage;
impl Language for BgLanguage {
    fn language_code(&self) -> &'static str {
        "bg"
    }
}

#[derive(Clone, Default)]
pub(crate) struct BnLanguage;
impl Language for BnLanguage {
    fn language_code(&self) -> &'static str {
        "bn"
    }
}

#[derive(Clone, Default)]
pub(crate) struct EnLanguage;
impl Language for EnLanguage {
    fn language_code(&self) -> &'static str {
        "en"
    }
}

#[derive(Clone, Default)]
pub(crate) struct EsLanguage;
impl Language for EsLanguage {
    fn language_code(&self) -> &'static str {
        "es"
    }
}
#[derive(Clone, Default)]
pub(crate) struct CaLanguage;
impl Language for CaLanguage {
    fn language_code(&self) -> &'static str {
        "ca"
    }
}

#[derive(Clone, Default)]
pub(crate) struct FrLanguage;
impl Language for FrLanguage {
    fn language_code(&self) -> &'static str {
        "fr"
    }
}

#[derive(Clone, Default)]
pub(crate) struct PlLanguage;
impl Language for PlLanguage {
    fn language_code(&self) -> &'static str {
        "pl"
    }
}

#[derive(Clone, Default)]
pub(crate) struct PtLanguage;
impl Language for PtLanguage {
    fn language_code(&self) -> &'static str {
        "pt"
    }
}

#[derive(Clone, Default)]
pub(crate) struct RuLanguage;
impl Language for RuLanguage {
    fn language_code(&self) -> &'static str {
        "ru"
    }
    fn continue_in_next_word(&self, text_after_boundary: &str) -> bool {
        RU_CNW.is_match(text_after_boundary)
    }
}

#[derive(Clone, Default)]
pub(crate) struct DeLanguage;
impl Language for DeLanguage {
    fn language_code(&self) -> &'static str {
        "de"
    }
    fn is_punctuation_between_quotes(&self) -> bool {
        true
    }
    fn continue_in_next_word(&self, text_after_boundary: &str) -> bool {
        if CNW_REGEX.is_match(text_after_boundary) {
            return true;
        }
        match text_after_boundary.trim().split_word_bounds().next() {
            Some(word) => {
                let word = word
                    .strip_prefix("?!.")
                    .unwrap_or(word)
                    .strip_suffix("?!.")
                    .unwrap_or(word);
                if word.is_empty() {
                    return false;
                }
                if DE_MONTHS.contains(&word) || DE_MONTHS.contains(&to_title_case(word).as_str()) {
                    return true;
                }
                false
            }
            None => false,
        }
    }
}
#[derive(Clone, Default)]
pub(crate) struct DaLanguage;
impl Language for DaLanguage {
    fn language_code(&self) -> &'static str {
        "da"
    }
    fn continue_in_next_word(&self, text_after_boundary: &str) -> bool {
        CNW_REGEX.is_match(text_after_boundary)
    }
}

#[derive(Clone, Default)]
pub(crate) struct ElLanguage;
impl Language for ElLanguage {
    fn language_code(&self) -> &'static str {
        "el"
    }
    fn sentence_break_regex(&self) -> &Regex {
        &EL_SENTENCE_BOUNDARY_REGEX
    }
}

#[derive(Clone, Default)]
pub(crate) struct FiLanguage;
impl Language for FiLanguage {
    fn language_code(&self) -> &'static str {
        "fi"
    }
    fn continue_in_next_word(&self, text_after_boundary: &str) -> bool {
        if CNW_REGEX.is_match(text_after_boundary) {
            return true;
        }
        match text_after_boundary.trim().split_word_bounds().next() {
            Some(word) => {
                let word = word
                    .strip_prefix("?!.")
                    .unwrap_or(word)
                    .strip_suffix("?!.")
                    .unwrap_or(word);
                if word.is_empty() {
                    return false;
                }
                if FI_MONTHS.contains(&word) || FI_MONTHS.contains(&to_title_case(word).as_str()) {
                    return true;
                }
                false
            }
            None => false,
        }
    }
}

#[derive(Clone, Default)]
pub(crate) struct GuLanguage;
impl Language for GuLanguage {
    fn language_code(&self) -> &'static str {
        "gu"
    }
}

#[derive(Clone, Default)]
pub(crate) struct HiLanguage;
impl Language for HiLanguage {
    fn language_code(&self) -> &'static str {
        "hi"
    }
}
#[derive(Clone, Default)]
pub(crate) struct MrLanguage;
impl Language for MrLanguage {
    fn language_code(&self) -> &'static str {
        "mr"
    }
}

#[derive(Clone, Default)]
pub(crate) struct HyLanguage;
impl Language for HyLanguage {
    fn language_code(&self) -> &'static str {
        "hy"
    }
    fn sentence_break_regex(&self) -> &Regex {
        &HY_SENTENCE_BOUNDARY_REGEX
    }
}

#[derive(Clone, Default)]
pub(crate) struct ItLanguage;
impl Language for ItLanguage {
    fn language_code(&self) -> &'static str {
        "it"
    }
    fn get_lastword<'a>(&'a self, text: &'a str) -> Option<&'a str> {
        let last_word = WORD_SPLIT_REGEX.split(text).last()?;
        last_word.split("l'").last()
    }
}

#[derive(Clone, Default)]
pub(crate) struct KkLanguage;
impl Language for KkLanguage {
    fn language_code(&self) -> &'static str {
        "kk"
    }
    fn continue_in_next_word(&self, text_after_boundary: &str) -> bool {
        KK_CNW_REGEX.is_match(text_after_boundary)
    }
}

#[derive(Clone, Default)]
pub(crate) struct KnLanguage;
impl Language for KnLanguage {
    fn language_code(&self) -> &'static str {
        "kn"
    }
}

#[derive(Clone, Default)]
pub(crate) struct MlLanguage;
impl Language for MlLanguage {
    fn language_code(&self) -> &'static str {
        "ml"
    }
}

#[derive(Clone, Default)]
pub(crate) struct MyLanguage;
impl Language for MyLanguage {
    fn language_code(&self) -> &'static str {
        "my"
    }
    fn sentence_break_regex(&self) -> &Regex {
        &MY_SENTENCE_BOUNDARY_REGEX
    }
}

#[derive(Clone, Default)]
pub(crate) struct NlLanguage;
impl Language for NlLanguage {
    fn language_code(&self) -> &'static str {
        "nl"
    }
}

#[derive(Clone, Default)]
pub(crate) struct OrLanguage;
impl Language for OrLanguage {
    fn language_code(&self) -> &'static str {
        "or"
    }
}

#[derive(Clone, Default)]
pub(crate) struct PaLanguage;
impl Language for PaLanguage {
    fn language_code(&self) -> &'static str {
        "pa"
    }
}

#[derive(Clone, Default)]
pub(crate) struct SkLanguage;
impl Language for SkLanguage {
    fn language_code(&self) -> &'static str {
        "sk"
    }
    fn continue_in_next_word(&self, text_after_boundary: &str) -> bool {
        if CNW_REGEX.is_match(text_after_boundary) {
            return true;
        }
        match text_after_boundary.trim().split_word_bounds().next() {
            Some(word) => {
                let word = word
                    .strip_prefix("?!.")
                    .unwrap_or(word)
                    .strip_suffix("?!.")
                    .unwrap_or(word);
                if word.is_empty() {
                    return false;
                }
                if SK_MONTHS.contains(&word) || SK_MONTHS.contains(&to_title_case(word).as_str()) {
                    return true;
                }
                false
            }
            None => false,
        }
    }
}

#[derive(Clone, Default)]
pub(crate) struct TaLanguage;
impl Language for TaLanguage {
    fn language_code(&self) -> &'static str {
        "ta"
    }
}

#[derive(Clone, Default)]
pub(crate) struct TeLanguage;
impl Language for TeLanguage {
    fn language_code(&self) -> &'static str {
        "te"
    }
}
