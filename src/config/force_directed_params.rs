use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ForceDirectedParams {
    pub iterations: u32,
    pub repulsion: f32,
    pub attraction: f32,
    pub damping: f32,
    pub delta_time: f32,
}

impl Default for ForceDirectedParams {
    fn default() -> Self {
        Self {
            iterations: 100,
            repulsion: 1.0,
            attraction: 0.01,
            damping: 0.85,
            delta_time: 0.016,
        }
    }
}
