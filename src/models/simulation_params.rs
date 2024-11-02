use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum SimulationMode {
    Remote,  // GPU-accelerated remote computation
    GPU,     // Local GPU computation
    Local,   // CPU-based local computation
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[repr(C)]
pub struct SimulationParams {
    pub iterations: u32,
    pub repulsion_strength: f32,
    pub attraction_strength: f32,
    pub damping: f32,
    pub padding: u32,  // For alignment in GPU buffers
}

impl Default for SimulationParams {
    fn default() -> Self {
        Self {
            iterations: 100,
            repulsion_strength: 1.0,
            attraction_strength: 0.5,
            damping: 0.9,
            padding: 0,
        }
    }
}

// SAFETY: This type is #[repr(C)], contains only Pod types (u32 and f32),
// and has no padding due to field ordering. All bit patterns are valid.
unsafe impl bytemuck::Pod for SimulationParams {}

// SAFETY: All fields are primitives that can be safely zeroed
unsafe impl bytemuck::Zeroable for SimulationParams {}

impl SimulationParams {
    pub fn new(
        iterations: u32,
        repulsion_strength: f32,
        attraction_strength: f32,
        damping: f32,
    ) -> Self {
        Self {
            iterations,
            repulsion_strength,
            attraction_strength,
            damping,
            padding: 0,
        }
    }

    pub fn with_iterations(mut self, iterations: u32) -> Self {
        self.iterations = iterations;
        self
    }

    pub fn with_repulsion(mut self, repulsion: f32) -> Self {
        self.repulsion_strength = repulsion;
        self
    }

    pub fn with_attraction(mut self, attraction: f32) -> Self {
        self.attraction_strength = attraction;
        self
    }

    pub fn with_damping(mut self, damping: f32) -> Self {
        self.damping = damping;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simulation_params_default() {
        let params = SimulationParams::default();
        assert_eq!(params.iterations, 100);
        assert_eq!(params.repulsion_strength, 1.0);
        assert_eq!(params.attraction_strength, 0.5);
        assert_eq!(params.damping, 0.9);
    }

    #[test]
    fn test_simulation_params_builder() {
        let params = SimulationParams::default()
            .with_iterations(200)
            .with_repulsion(2.0)
            .with_attraction(1.0)
            .with_damping(0.8);

        assert_eq!(params.iterations, 200);
        assert_eq!(params.repulsion_strength, 2.0);
        assert_eq!(params.attraction_strength, 1.0);
        assert_eq!(params.damping, 0.8);
    }

    #[test]
    fn test_simulation_params_new() {
        let params = SimulationParams::new(150, 1.5, 0.75, 0.85);
        assert_eq!(params.iterations, 150);
        assert_eq!(params.repulsion_strength, 1.5);
        assert_eq!(params.attraction_strength, 0.75);
        assert_eq!(params.damping, 0.85);
    }
}