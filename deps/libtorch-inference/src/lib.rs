use ndarray::{ArrayD, IxDyn};
use std::path::Path;
use tch::{CModule, TchError, Tensor};

pub type LibtorchResult<T> = Result<T, LibtorchError>;

#[derive(Debug)]
pub enum LibtorchError {
    InferenceError(TchError),
    OperationError(String),
}

impl From<TchError> for LibtorchError {
    fn from(other: TchError) -> Self {
        Self::InferenceError(other)
    }
}

pub struct LibtorchInferenceSession(CModule);

impl LibtorchInferenceSession {
    pub fn from_path(model_path: impl AsRef<Path>) -> LibtorchResult<Self> {
        if !model_path.as_ref().exists() {
            return Err(LibtorchError::OperationError(format!(
                "Model file not found: `{}`",
                model_path.as_ref().display()
            )));
        }
        let mut model = CModule::load(model_path)?;
        model.f_set_eval()?;
        Ok(Self(model))
    }
    pub fn run(&self, inputs: &[Tensor]) -> LibtorchResult<LibtorchOutput> {
        let output = self.0.forward_ts(inputs)?;
        Ok(output.into())
    }
}

pub struct LibtorchOutput(Tensor);

impl<T: tch::kind::Element> TryFrom<LibtorchOutput> for ArrayD<T> {
    type Error = LibtorchError;

    fn try_from(output: LibtorchOutput) ->  LibtorchResult<Self> {
        let t = output.0;
        let num_elem = t.numel();
        let mut vec = vec![T::ZERO; num_elem];
        t.f_to_kind(T::KIND)?.f_copy_data(&mut vec, num_elem)?;
        let shape: Vec<usize> = t.size().iter().map(|s| *s as usize).collect();
        let array = ArrayD::from_shape_vec(IxDyn(&shape), vec).map_err(|_| {
            LibtorchError::OperationError(
                "Cannot convert output to ndarray Array. Invalid model output.".to_string(),
            )
        })?;
        Ok(array)
    }
}


impl From<Tensor> for LibtorchOutput {
    fn from(other: Tensor) -> Self {
        Self(other)
    }
}


#[cfg(test)]
mod test {
    use super::*;
    use once_cell::sync::Lazy;
    use tch::{Device, Kind, Tensor};

    const SCRIPT_MODULE_PATH: &str = "./assets/model.pt";
    static INFERENCE_SESSION: Lazy<LibtorchInferenceSession> =
        Lazy::new(|| LibtorchInferenceSession::from_path(SCRIPT_MODULE_PATH).unwrap());

    #[test]
    fn test_basic() -> LibtorchResult<()> {
        let input = Tensor::rand([32], (Kind::Float, Device::Cpu));
        let output = INFERENCE_SESSION.run(&[input])?;
        let _array: ArrayD<f32> = output.try_into()?;
        Ok(())
    }
    #[test]
    fn test_with_ndarray_input() -> LibtorchResult<()> {
        let input = ndarray::Array1::<f32>::ones(32);
        let input_t: Tensor = input.try_into().unwrap();
        let output = INFERENCE_SESSION.run(&[input_t])?;
        let _array: ArrayD<f32> = output.try_into()?;
        Ok(())
    }
}
