use bytemuck::{Pod, Zeroable};
use crate::config::VisualizationSettings;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable, Debug)]
pub struct SimulationParams {
    pub iterations: u32,
    pub repulsion_strength: f32,
    pub attraction_strength: f32,
    pub damping: f32,
    pub padding: u32, // Added to ensure 20-byte size
}

impl Default for SimulationParams {
    fn default() -> Self {
        Self {
            iterations: 100,
            repulsion_strength: 5.0,
            attraction_strength: 0.01,
            damping: 0.9,
            padding: 0,
        }
    }
}

impl From<&VisualizationSettings> for SimulationParams {
    fn from(settings: &VisualizationSettings) -> Self {
        Self {
            iterations: settings.force_directed_iterations as u32,
            repulsion_strength: settings.force_directed_repulsion,
            attraction_strength: settings.force_directed_attraction,
            damping: 0.9, // You might want to add this to VisualizationSettings
            padding: 0,
        }
    }
}
