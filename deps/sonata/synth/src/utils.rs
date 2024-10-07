#[allow(dead_code)]
pub fn param_to_percent(value: f32, min: f32, max: f32) -> u8 {
    ((value - min) / (max - min) * 100.0f32).round() as u8
}

pub fn percent_to_param(value: u8, min: f32, max: f32) -> f32 {
    (value as f32 / 100.0f32) * (max - min) + min
}
