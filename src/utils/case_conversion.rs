use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref CAMEL_TO_SNAKE: Regex = Regex::new(r"([a-z0-9])([A-Z])").unwrap();
    static ref SNAKE_TO_CAMEL: Regex = Regex::new(r"[_-]([a-z])").unwrap();
    static ref CAMEL_TO_KEBAB: Regex = Regex::new(r"([a-z0-9])([A-Z])").unwrap();
    static ref SNAKE_TO_KEBAB: Regex = Regex::new(r"_").unwrap();
    static ref KEBAB_TO_SNAKE: Regex = Regex::new(r"-").unwrap();
}

pub fn to_snake_case(s: &str) -> String {
    // First convert kebab-case to snake_case
    let s = KEBAB_TO_SNAKE.replace_all(s, "_");
    // Then convert camelCase to snake_case
    CAMEL_TO_SNAKE.replace_all(&s, "${1}_${2}").to_lowercase()
}

pub fn to_camel_case(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = false;

    for (i, c) in s.chars().enumerate() {
        if c == '_' {
            capitalize_next = true;
        } else if capitalize_next {
            result.push(c.to_ascii_uppercase());
            capitalize_next = false;
        } else if i == 0 {
            result.push(c.to_ascii_lowercase());
        } else {
            result.push(c);
        }
    }

    result
}

pub fn to_kebab_case(s: &str) -> String {
    // First convert to snake case (handles both camelCase and existing snake_case)
    let snake = to_snake_case(s);
    // Then replace underscores with hyphens
    SNAKE_TO_KEBAB.replace_all(&snake, "-").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_snake_case() {
        // Test camelCase to snake_case
        assert_eq!(to_snake_case("baseSize"), "base_size");
        assert_eq!(to_snake_case("enableHoverEffect"), "enable_hover_effect");
        assert_eq!(to_snake_case("backgroundColor"), "background_color");

        // Test kebab-case to snake_case
        assert_eq!(to_snake_case("base-size"), "base_size");
        assert_eq!(to_snake_case("enable-hover-effect"), "enable_hover_effect");

        // Test already snake_case
        assert_eq!(to_snake_case("base_size"), "base_size");
        assert_eq!(to_snake_case("enable_hover_effect"), "enable_hover_effect");

        // Test mixed cases
        assert_eq!(to_snake_case("base-Size"), "base_size");
        assert_eq!(to_snake_case("enable_hoverEffect"), "enable_hover_effect");
    }

    #[test]
    fn test_to_camel_case() {
        // Test snake_case to camelCase
        assert_eq!(to_camel_case("base_size"), "baseSize");
        assert_eq!(to_camel_case("enable_hover_effect"), "enableHoverEffect");

        // Test kebab-case to camelCase
        assert_eq!(to_camel_case("base-size"), "baseSize");
        assert_eq!(to_camel_case("enable-hover-effect"), "enableHoverEffect");

        // Test already camelCase
        assert_eq!(to_camel_case("baseSize"), "baseSize");
        assert_eq!(to_camel_case("enableHoverEffect"), "enableHoverEffect");

        // Test mixed cases
        assert_eq!(to_camel_case("base-Size"), "baseSize");
        assert_eq!(to_camel_case("enable_hoverEffect"), "enableHoverEffect");
    }

    #[test]
    fn test_to_kebab_case() {
        // Test camelCase to kebab-case
        assert_eq!(to_kebab_case("baseSize"), "base-size");
        assert_eq!(to_kebab_case("enableHoverEffect"), "enable-hover-effect");

        // Test snake_case to kebab-case
        assert_eq!(to_kebab_case("base_size"), "base-size");
        assert_eq!(to_kebab_case("enable_hover_effect"), "enable-hover-effect");

        // Test already kebab-case
        assert_eq!(to_kebab_case("base-size"), "base-size");
        assert_eq!(to_kebab_case("enable-hover-effect"), "enable-hover-effect");

        // Test mixed cases
        assert_eq!(to_kebab_case("base_Size"), "base-size");
        assert_eq!(to_kebab_case("enable-hoverEffect"), "enable-hover-effect");
    }
}
