use wgpu::{Device, Queue, Buffer, BindGroup, ComputePipeline, InstanceDescriptor};
use wgpu::util::DeviceExt;
use std::io::Error;
use std::collections::HashMap;
use log::{debug, info};
use crate::models::graph::GraphData;
use crate::models::node::{Node, GPUNode};
use crate::models::edge::GPUEdge;
use crate::models::simulation_params::SimulationParams;
use rand::Rng;
use futures::channel::oneshot;

// Constants for optimal performance
const WORKGROUP_SIZE: u32 = 256; // Optimal workgroup size
const INITIAL_BUFFER_SIZE: u64 = 1024 * 1024; // 1MB initial buffer size

/// Struct representing the GPU compute capabilities
pub struct GPUCompute {
    device: Device,
    queue: Queue,
    nodes_buffer: Buffer,
    edges_buffer: Buffer,
    simulation_params_buffer: Buffer,
    bind_group: BindGroup,
    compute_pipeline: ComputePipeline,
    num_nodes: u32,
    num_edges: u32,
    simulation_params: SimulationParams,
}

impl GPUCompute {
    /// Creates a new GPUCompute instance
    pub async fn new() -> Result<Self, Error> {
        debug!("Initializing GPU compute capabilities");
        
        // Initialize the GPU instance with default descriptor
        let instance = wgpu::Instance::new(InstanceDescriptor::default());

        // Request a high-performance GPU adapter
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .ok_or_else(|| Error::new(std::io::ErrorKind::Other, "Failed to find an appropriate adapter"))?;

        // Log adapter info
        info!("Selected GPU adapter: {:?}", adapter.get_info().name);

        // Create the logical device and command queue
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("Primary Device"),
                    features: wgpu::Features::empty(),
                    limits: wgpu::Limits::default(),
                },
                None,
            )
            .await
            .map_err(|e| Error::new(std::io::ErrorKind::Other, e.to_string()))?;

        // Load and create the compute shader module
        let cs_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Force Calculation Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("force_calculation.wgsl").into()),
        });

        // Create the bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compute Bind Group Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        // Create initial simulation parameters
        let simulation_params = SimulationParams::default();
        let simulation_params_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Simulation Params Buffer"),
            contents: bytemuck::cast_slice(&[simulation_params]),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        // Create the compute pipeline
        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Force Directed Graph Compute Pipeline"),
            layout: Some(&device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Compute Pipeline Layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            })),
            module: &cs_module,
            entry_point: "main",
        });

        // Create initial buffers
        let nodes_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Nodes Buffer"),
            size: INITIAL_BUFFER_SIZE,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        let edges_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Edges Buffer"),
            size: INITIAL_BUFFER_SIZE,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create the bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Compute Bind Group"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: nodes_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: edges_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: simulation_params_buffer.as_entire_binding(),
                },
            ],
        });

        Ok(Self {
            device,
            queue,
            nodes_buffer,
            edges_buffer,
            simulation_params_buffer,
            bind_group,
            compute_pipeline,
            num_nodes: 0,
            num_edges: 0,
            simulation_params,
        })
    }

    /// Sets the graph data for GPU computation
    pub fn set_graph_data(&mut self, graph: &GraphData) -> Result<(), Error> {
        debug!("Setting graph data: {} nodes, {} edges", graph.nodes.len(), graph.edges.len());
        
        self.num_nodes = graph.nodes.len() as u32;
        self.num_edges = graph.edges.len() as u32;

        // Convert nodes to GPU representation with initial random positions
        let mut rng = rand::thread_rng();
        let gpu_nodes: Vec<GPUNode> = graph.nodes.iter().enumerate().map(|(i, node)| {
            let mut gpu_node = node.to_gpu_node();
            gpu_node.x = rng.gen_range(-75.0..75.0);
            gpu_node.y = rng.gen_range(-75.0..75.0);
            gpu_node.z = rng.gen_range(-75.0..75.0);
            
            if i < 5 {
                debug!("Initial position for node {}: ({}, {}, {})", 
                      i, gpu_node.x, gpu_node.y, gpu_node.z);
            }
            
            gpu_node
        }).collect();

        // Convert edges to GPU representation
        let gpu_edges: Vec<GPUEdge> = graph.edges.iter()
            .map(|edge| edge.to_gpu_edge(&graph.nodes))
            .collect();

        // Update buffers
        self.update_buffers(&gpu_nodes, &gpu_edges)?;

        debug!("Graph data set successfully");
        Ok(())
    }

    /// Updates the force-directed graph parameters
    pub fn set_force_directed_params(&mut self, params: &SimulationParams) -> Result<(), Error> {
        debug!("Updating force-directed parameters: {:?}", params);
        self.simulation_params = *params;

        self.queue.write_buffer(
            &self.simulation_params_buffer,
            0,
            bytemuck::cast_slice(&[self.simulation_params]),
        );

        Ok(())
    }

    /// Computes forces for the graph layout
    pub fn compute_forces(&self) -> Result<(), Error> {
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Force Computation Encoder"),
        });

        {
            let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Force Computation Pass"),
            });
            cpass.set_pipeline(&self.compute_pipeline);
            cpass.set_bind_group(0, &self.bind_group, &[]);
            
            let workgroup_count = (self.num_nodes + WORKGROUP_SIZE - 1) / WORKGROUP_SIZE;
            cpass.dispatch_workgroups(workgroup_count, 1, 1);
        }

        self.queue.submit(Some(encoder.finish()));
        Ok(())
    }

    /// Updates the GPU buffers with new node and edge data
    fn update_buffers(&mut self, gpu_nodes: &[GPUNode], gpu_edges: &[GPUEdge]) -> Result<(), Error> {
        // Update or recreate the nodes buffer
        let nodes_data = bytemuck::cast_slice(gpu_nodes);
        if (nodes_data.len() as u64) > self.nodes_buffer.size() {
            debug!("Recreating nodes buffer with size: {} bytes", nodes_data.len());
            self.nodes_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Nodes Buffer"),
                contents: nodes_data,
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC,
            });
        } else {
            self.queue.write_buffer(&self.nodes_buffer, 0, nodes_data);
        }

        // Update or recreate the edges buffer
        let edges_data = bytemuck::cast_slice(gpu_edges);
        if (edges_data.len() as u64) > self.edges_buffer.size() {
            debug!("Recreating edges buffer with size: {} bytes", edges_data.len());
            self.edges_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Edges Buffer"),
                contents: edges_data,
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            });
        } else {
            self.queue.write_buffer(&self.edges_buffer, 0, edges_data);
        }

        // Recreate the bind group with updated buffers
        self.bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Compute Bind Group"),
            layout: &self.compute_pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.nodes_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.edges_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.simulation_params_buffer.as_entire_binding(),
                },
            ],
        });

        Ok(())
    }

    /// Gets the updated node positions from the GPU buffer
    pub async fn get_updated_positions(&self) -> Result<Vec<Node>, Error> {
        // Return empty vector if there are no nodes
        if self.num_nodes == 0 {
            return Ok(Vec::new());
        }

        // Calculate the buffer size needed for the nodes
        let buffer_size = (self.num_nodes as u64) * std::mem::size_of::<GPUNode>() as u64;
        
        // Create a staging buffer to read back the node data
        let staging_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Node Position Staging Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create and submit a command encoder to copy data from nodes buffer to staging buffer
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Position Readback Encoder"),
        });

        encoder.copy_buffer_to_buffer(
            &self.nodes_buffer,
            0,
            &staging_buffer,
            0,
            buffer_size,
        );

        self.queue.submit(Some(encoder.finish()));

        // Map the staging buffer to read the data
        let slice = staging_buffer.slice(..);
        let (tx, rx) = oneshot::channel();
        slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });
        self.device.poll(wgpu::Maintain::Wait);

        match rx.await {
            Ok(Ok(())) => {
                // Read the mapped data
                let data = slice.get_mapped_range();
                let gpu_nodes: &[GPUNode] = bytemuck::cast_slice(&data);

                // Convert GPU nodes back to regular nodes
                let nodes: Vec<Node> = gpu_nodes.iter().enumerate().map(|(i, gpu_node)| {
                    Node {
                        id: i.to_string(),
                        label: format!("Node {}", i),
                        metadata: HashMap::new(),
                        x: gpu_node.x,
                        y: gpu_node.y,
                        z: gpu_node.z,
                        vx: gpu_node.vx,
                        vy: gpu_node.vy,
                        vz: gpu_node.vz,
                    }
                }).collect();

                // Clean up
                drop(data);
                staging_buffer.unmap();

                Ok(nodes)
            },
            Ok(Err(e)) => Err(Error::new(std::io::ErrorKind::Other, format!("Buffer mapping failed: {:?}", e))),
            Err(e) => Err(Error::new(std::io::ErrorKind::Other, format!("Channel receive failed: {}", e))),
        }
    }
}
