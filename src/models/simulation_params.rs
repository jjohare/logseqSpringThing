use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct SimulationParams {
    pub iterations: usize,
    pub repulsion_strength: f32,
    pub attraction_strength: f32,
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
        }
    }
}

impl From<&crate::config::VisualizationSettings> for SimulationParams {
    fn from(settings: &crate::config::VisualizationSettings) -> Self {
        SimulationParams {
            iterations: settings.force_directed_iterations,
            repulsion_strength: settings.force_directed_repulsion,
            attraction_strength: settings.force_directed_attraction,
        }
    }
}
