use serde::{Serialize, Deserialize};
use bytemuck::{Pod, Zeroable};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct SimulationParams {
    pub iterations: u32, // Changed from usize to u32 for consistent size across platforms
    pub repulsion_strength: f32,
    pub attraction_strength: f32,
    _padding: u32, // Added padding to ensure 16-byte alignment
}

pub enum SimulationMode {
    Local,
    GPU,
    Remote,
}

impl Default for SimulationMode {
    fn default() -> Self {
        SimulationMode::Local
    }
}

impl Default for SimulationParams {
    fn default() -> Self {
        Self {
            iterations: 100,
            repulsion_strength: 1.0,
            attraction_strength: 0.01,
            _padding: 0,
        }
    }
}

impl From<&crate::config::VisualizationSettings> for SimulationParams {
    fn from(settings: &crate::config::VisualizationSettings) -> Self {
        SimulationParams {
            iterations: settings.force_directed_iterations as u32,
            repulsion_strength: settings.force_directed_repulsion,
            attraction_strength: settings.force_directed_attraction,
            _padding: 0,
        }
    }
}
