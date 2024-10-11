use wgpu::{Device, Queue, Buffer, BindGroup, ComputePipeline, InstanceDescriptor};
use wgpu::util::DeviceExt;
use std::io::Error;
use log::{error, info, debug};
use crate::models::graph::GraphData;
use crate::models::node::{Node, GPUNode};
use crate::models::edge::GPUEdge;
use crate::models::simulation_params::SimulationParams;
use rand::Rng;

const INITIAL_BUFFER_SIZE: u64 = 1024;

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
}

impl GPUCompute {
    pub async fn new() -> Result<Self, Error> {
        let instance = wgpu::Instance::new(InstanceDescriptor::default());
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::default(),
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .ok_or_else(|| Error::new(std::io::ErrorKind::Other, "Request adapter error"))?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    features: wgpu::Features::empty(),
                    limits: wgpu::Limits::default(),
                    label: None,
                },
                None,
            )
            .await
            .map_err(|e| Error::new(std::io::ErrorKind::Other, e.to_string()))?;

        let cs_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Force Calculation Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("force_calculation.wgsl").into()),
        });

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

        let simulation_params_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Simulation Params Buffer"),
            contents: bytemuck::cast_slice(&[SimulationParams::default()]),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compute Pipeline"),
            layout: Some(&device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Pipeline Layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            })),
            module: &cs_module,
            entry_point: "main",
        });

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
        })
    }

    pub fn set_graph_data(&mut self, graph: &GraphData) -> Result<(), Error> {
        self.num_nodes = graph.nodes.len() as u32;
        self.num_edges = graph.edges.len() as u32;

        let mut rng = rand::thread_rng();
        let gpu_nodes: Vec<GPUNode> = graph.nodes.iter().enumerate().map(|(i, node)| {
            let mut gpu_node = node.to_gpu_node();
            gpu_node.x = rng.gen_range(-75.0..75.0);
            gpu_node.y = rng.gen_range(-75.0..75.0);
            gpu_node.z = rng.gen_range(-75.0..75.0);
            
            if i < 5 {
                debug!("Initial position for node {}: ({}, {}, {})", i, gpu_node.x, gpu_node.y, gpu_node.z);
            }
            
            gpu_node
        }).collect();

        let gpu_edges: Vec<GPUEdge> = graph.edges.iter().map(|edge| edge.to_gpu_edge(&graph.nodes)).collect();

        let nodes_data = bytemuck::cast_slice(&gpu_nodes);
        if (nodes_data.len() as u64) > self.nodes_buffer.size() {
            self.nodes_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Nodes Buffer"),
                contents: nodes_data,
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC,
            });
        } else {
            self.queue.write_buffer(&self.nodes_buffer, 0, nodes_data);
        }

        let edges_data = bytemuck::cast_slice(&gpu_edges);
        if (edges_data.len() as u64) > self.edges_buffer.size() {
            self.edges_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Edges Buffer"),
                contents: edges_data,
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            });
        } else {
            self.queue.write_buffer(&self.edges_buffer, 0, edges_data);
        }

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

        info!("Updated GPU buffers: {} nodes, {} edges", self.num_nodes, self.num_edges);
        Ok(())
    }

    pub fn compute_forces(&self) -> Result<(), Error> {
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Compute Encoder"),
        });

        {
            let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Compute Pass"),
            });
            cpass.set_pipeline(&self.compute_pipeline);
            cpass.set_bind_group(0, &self.bind_group, &[]);
            cpass.dispatch_workgroups((self.num_nodes + 63) / 64, 1, 1);
        }

        self.queue.submit(Some(encoder.finish()));
        Ok(())
    }

    pub async fn get_updated_positions(&self) -> Result<Vec<Node>, Error> {
        let buffer_size = std::mem::size_of::<GPUNode>() * self.num_nodes as usize;
        let staging_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Staging Buffer"),
            size: buffer_size as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Retrieval Encoder"),
        });

        encoder.copy_buffer_to_buffer(&self.nodes_buffer, 0, &staging_buffer, 0, buffer_size as u64);

        self.queue.submit(Some(encoder.finish()));

        let buffer_slice = staging_buffer.slice(..);
        let (sender, receiver) = futures_intrusive::channel::shared::oneshot_channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |v| sender.send(v).unwrap());

        self.device.poll(wgpu::Maintain::Wait);

        receiver.receive().await.unwrap().map_err(|e| {
            error!("Failed to map staging buffer: {:?}", e);
            Error::new(std::io::ErrorKind::Other, "Failed to map staging buffer")
        })?;

        let data = buffer_slice.get_mapped_range();
        let gpu_nodes: Vec<GPUNode> = bytemuck::cast_slice(&data).to_vec();
        drop(data);
        staging_buffer.unmap();

        let nodes: Vec<Node> = gpu_nodes.iter().enumerate().map(|(i, gpu_node)| {
            let mut node = Node::default();
            node.update_from_gpu_node(gpu_node);
            
            if i < 5 {
                debug!("Final position for node {}: ({}, {}, {})", i, node.x, node.y, node.z);
            }
            
            node
        }).collect();

        Ok(nodes)
    }
}
