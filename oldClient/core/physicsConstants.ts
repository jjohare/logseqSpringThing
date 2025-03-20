// Physics parameter ranges and defaults in base units (meters, m/s)
export const PHYSICS_CONSTANTS = {
    // Attraction force (supplementary cohesion)
    ATTRACTION: {
        MIN: 0.001,
        MAX: 0.05,
        DEFAULT: 0.01,  // 1cm/s² base attraction
        RECOMMENDED_RANGE: {
            MIN: 0.005,
            MAX: 0.05
        }
    },

    // Repulsion force (separation between nodes)
    REPULSION: {
        MIN: 0.1,
        MAX: 0.2,
        DEFAULT: 0.1,  // Base repulsion (with 1/d² falloff)
        RECOMMENDED_RANGE: {
            MIN: 0.05,
            MAX: 0.15
        }
    },

    // Spring force (linear with distance)
    SPRING: {
        MIN: 0.001,
        MAX: 0.1,
        DEFAULT: 0.05,  // 5cm/s² per meter of stretch
        RECOMMENDED_RANGE: {
            MIN: 0.02,
            MAX: 0.08
        }
    },

    // Damping (unitless, fraction of velocity retained)
    DAMPING: {
        MIN: 0.5,
        MAX: 0.95,
        DEFAULT: 0.95,  // 95% velocity retention
        RECOMMENDED_RANGE: {
            MIN: 0.9,
            MAX: 0.98
        }
    },

    // Simulation iterations per frame
    ITERATIONS: {
        MIN: 1,
        MAX: 200,
        DEFAULT: 100,  // Balance of stability and performance
        RECOMMENDED_RANGE: {
            MIN: 50,
            MAX: 150
        }
    },

    // Maximum velocity (meters per second)
    MAX_VELOCITY: {
        MIN: 0.01,
        MAX: 0.5,
        DEFAULT: 0.1,  // 10cm/s maximum
        RECOMMENDED_RANGE: {
            MIN: 0.05,
            MAX: 0.2
        }
    },

    // Collision radius (meters)
    COLLISION_RADIUS: {
        MIN: 0.01,
        MAX: 0.2,
        DEFAULT: 0.05,  // 5cm radius
        RECOMMENDED_RANGE: {
            MIN: 0.03,
            MAX: 0.1
        }
    },

    // Bounds size (meters, half-width of cubic bounds)
    BOUNDS_SIZE: {
        MIN: 0.5,
        MAX: 100.0,
        DEFAULT: 50.0,  // 50m bounds (100m cube)
        RECOMMENDED_RANGE: {
            MIN: 10.0,
            MAX: 75.0
        }
    }
};

// Helper types for physics parameters
export type PhysicsParameter = keyof typeof PHYSICS_CONSTANTS;
export type PhysicsRange = {
    MIN: number;
    MAX: number;
    DEFAULT: number;
    RECOMMENDED_RANGE: {
        MIN: number;
        MAX: number;
    };
};

// Helper functions for physics parameters
export const isWithinPhysicsRange = (param: PhysicsParameter, value: number): boolean => {
    const range = PHYSICS_CONSTANTS[param];
    return value >= range.MIN && value <= range.MAX;
};

export const isWithinRecommendedRange = (param: PhysicsParameter, value: number): boolean => {
    const range = PHYSICS_CONSTANTS[param].RECOMMENDED_RANGE;
    return value >= range.MIN && value <= range.MAX;
};

export const getPhysicsRange = (param: PhysicsParameter): PhysicsRange => {
    return PHYSICS_CONSTANTS[param];
};

export const getDefaultPhysicsValue = (param: PhysicsParameter): number => {
    return PHYSICS_CONSTANTS[param].DEFAULT;
};