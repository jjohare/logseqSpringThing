

pub trait Vocoder {
    type Input;
    type Output;

    fn mel2audio(&self, mels: Self::Input) -> Self::Output;
}

