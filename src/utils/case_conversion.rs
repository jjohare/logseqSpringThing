/// Case conversion utilities for ensuring consistent handling of case styles
/// between client (TypeScript - camelCase) and server (Rust - snake_case)

/// Converts a string to snake_case from various formats (camelCase, PascalCase, kebab-case)
/// 
/// # Examples
/// 
/// ```
/// let snake = to_snake_case("helloWorld"); // "hello_world"
/// let snake = to_snake_case("HelloWorld"); // "hello_world"
/// let snake = to_snake_case("hello-world"); // "hello_world"
/// ```
pub fn to_snake_case(s: &str) -> String {
    if s.is_empty() {
        return String::new();
    }

    // First handle kebab-case by replacing hyphens with underscores
    let s = s.replace('-', "_");
    
    // Then handle camelCase and PascalCase by adding underscores before uppercase letters
    let mut result = String::with_capacity(s.len() + 4);
    let mut prev_is_lowercase = false;
    
    for (i, c) in s.chars().enumerate() {
        if c.is_ascii_uppercase() {
            // Add underscore before uppercase letter, but only if:
            // 1. Not the first character in the string
            // 2. Previous character was lowercase (to handle cases like "HTTPRequest" properly)
            // 3. Or next character is lowercase (to handle "ID" in "UserID" properly)
            if i > 0 && (prev_is_lowercase || 
                       s.chars().nth(i + 1).map_or(false, |next| next.is_ascii_lowercase())) {
                result.push('_');
            }
            result.push(c.to_ascii_lowercase());
            prev_is_lowercase = false;
        } else {
            result.push(c);
            prev_is_lowercase = c.is_ascii_lowercase();
        }
    }
    
    // Handle multiple consecutive underscores
    let mut cleaned = String::with_capacity(result.len());
    let mut last_was_underscore = false;
    
    for c in result.chars() {
        if c == '_' {
            if !last_was_underscore {
                cleaned.push(c);
            }
            last_was_underscore = true;
        } else {
            cleaned.push(c);
            last_was_underscore = false;
        }
    }
    
    cleaned
}

/// Converts a string to camelCase from various formats (snake_case, PascalCase, kebab-case)
/// 
/// # Examples
/// 
/// ```
/// let camel = to_camel_case("hello_world"); // "helloWorld"
/// let camel = to_camel_case("HelloWorld"); // "helloWorld"
/// let camel = to_camel_case("hello-world"); // "helloWorld"
/// ```
pub fn to_camel_case(s: &str) -> String {
    if s.is_empty() {
        return String::new();
    }
    
    // Replace both hyphens and underscores with spaces for uniform handling
    let s = s.replace('-', " ").replace('_', " ");
    
    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = false;
    
    // First character is always lowercase in camelCase
    let mut chars = s.chars();
    if let Some(first) = chars.next() {
        result.push(first.to_ascii_lowercase());
    }
    
    for c in chars {
        if c == ' ' {
            capitalize_next = true;
        } else if capitalize_next {
            result.push(c.to_ascii_uppercase());
            capitalize_next = false;
        } else {
            result.push(c.to_ascii_lowercase());
        }
    }
    
    result.replace(' ', "")
}

/// Converts a string to kebab-case from various formats (camelCase, PascalCase, snake_case)
/// 
/// # Examples
/// 
/// ```
/// let kebab = to_kebab_case("helloWorld"); // "hello-world"
/// let kebab = to_kebab_case("hello_world"); // "hello-world"
/// let kebab = to_kebab_case("HelloWorld"); // "hello-world"
/// ```
pub fn to_kebab_case(s: &str) -> String {
    to_snake_case(s).replace('_', "-")
}

/// Converts a string to PascalCase from various formats (camelCase, snake_case, kebab-case)
/// 
/// # Examples
/// 
/// ```
/// let pascal = to_pascal_case("hello_world"); // "HelloWorld"
/// let pascal = to_pascal_case("helloWorld"); // "HelloWorld"
/// let pascal = to_pascal_case("hello-world"); // "HelloWorld"
/// ```
pub fn to_pascal_case(s: &str) -> String {
    if s.is_empty() {
        return String::new();
    }
    
    // Replace both hyphens and underscores with spaces for uniform handling
    let s = s.replace('-', " ").replace('_', " ");
    
    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = true;
    
    for c in s.chars() {
        if c == ' ' {
            capitalize_next = true;
        } else if capitalize_next {
            result.push(c.to_ascii_uppercase());
            capitalize_next = false;
        } else {
            result.push(c);
        }
    }
    
    result.replace(' ', "")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_snake_case() {
        // Test camelCase to snake_case
        assert_eq!(to_snake_case("helloWorld"), "hello_world");
        
        // Test PascalCase to snake_case
        assert_eq!(to_snake_case("HelloWorld"), "hello_world");
        
        // Test kebab-case to snake_case
        assert_eq!(to_snake_case("hello-world"), "hello_world");
        
        // Test with numbers
        assert_eq!(to_snake_case("user123Name"), "user123_name");
        
        // Test with acronyms
        assert_eq!(to_snake_case("getHTTPResponse"), "get_http_response");
        assert_eq!(to_snake_case("HTTPResponse"), "http_response");
        
        // Test edge cases
        assert_eq!(to_snake_case(""), "");
        assert_eq!(to_snake_case("a"), "a");
        assert_eq!(to_snake_case("A"), "a");
        
        // Test already snake_case
        assert_eq!(to_snake_case("hello_world"), "hello_world");
        
        // Test mixed cases and special characters
        assert_eq!(to_snake_case("user-ID-123"), "user_id_123");
        assert_eq!(to_snake_case("MixedCASE"), "mixed_case");
    }

    #[test]
    fn test_to_camel_case() {
        // Test snake_case to camelCase
        assert_eq!(to_camel_case("hello_world"), "helloWorld");
        
        // Test PascalCase to camelCase
        assert_eq!(to_camel_case("HelloWorld"), "helloWorld");
        
        // Test kebab-case to camelCase
        assert_eq!(to_camel_case("hello-world"), "helloWorld");
        
        // Test with numbers
        assert_eq!(to_camel_case("user_123_name"), "user123Name");
        
        // Test with acronyms
        assert_eq!(to_camel_case("get_http_response"), "getHttpResponse");
        
        // Test edge cases
        assert_eq!(to_camel_case(""), "");
        assert_eq!(to_camel_case("a"), "a");
        assert_eq!(to_camel_case("A"), "a");
        
        // Test already camelCase
        assert_eq!(to_camel_case("helloWorld"), "helloWorld");
    }

    #[test]
    fn test_to_kebab_case() {
        // Test camelCase to kebab-case
        assert_eq!(to_kebab_case("helloWorld"), "hello-world");
        
        // Test PascalCase to kebab-case
        assert_eq!(to_kebab_case("HelloWorld"), "hello-world");
        
        // Test snake_case to kebab-case
        assert_eq!(to_kebab_case("hello_world"), "hello-world");
        
        // Test with numbers
        assert_eq!(to_kebab_case("user123Name"), "user123-name");
        
        // Test edge cases
        assert_eq!(to_kebab_case(""), "");
        assert_eq!(to_kebab_case("a"), "a");
    }

    #[test]
    fn test_to_pascal_case() {
        // Test camelCase to PascalCase
        assert_eq!(to_pascal_case("helloWorld"), "HelloWorld");
        
        // Test snake_case to PascalCase
        assert_eq!(to_pascal_case("hello_world"), "HelloWorld");
        
        // Test kebab-case to PascalCase
        assert_eq!(to_pascal_case("hello-world"), "HelloWorld");
        
        // Test with numbers
        assert_eq!(to_pascal_case("user_123_name"), "User123Name");
        
        // Test edge cases
        assert_eq!(to_pascal_case(""), "");
        assert_eq!(to_pascal_case("a"), "A");
    }
} 