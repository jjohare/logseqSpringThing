use ffi_support::{call_with_result, define_string_destructor, ErrorCode, ExternError, FfiStr};
use sonata_core::{AudioSamples, SonataError, SonataModel, SonataResult};
use sonata_synth::{AudioOutputConfig, SonataSpeechSynthesizer, SYNTHESIS_THREAD_POOL};
use std::any::Any;
use std::ops::Deref;
use std::panic::AssertUnwindSafe;
use std::path::PathBuf;
use std::sync::{Arc, Once};

pub type SpeechSynthesisCallback = extern "C" fn(SynthesisEvent) -> u8;
define_string_destructor!(_internal_libsonataFreeString);
ffi_support::implement_into_ffi_by_pointer!(SonataVoice);
ffi_support::define_box_destructor!(SonataVoice, _internal_libsonataUnloadSonataVoice);
ffi_support::implement_into_ffi_by_pointer!(PiperSynthConfig);
ffi_support::define_box_destructor!(PiperSynthConfig, _internal_libsonataFreePiperSynthConfig);

static INIT_ORT_ENVIRONMENT: Once = Once::new();

pub mod error_codes {
    pub const INVALID_SYNTHESIS_MODE: i32 = 16;
    pub const FAILED_TO_LOAD_RESOURCE: i32 = 17;
    pub const PHONEMIZATION_ERROR: i32 = 18;
    pub const OPERATION_ERROR: i32 = 19;
    pub const INVALID_UTF8_SEQUENCE: i32 = 20;
    pub const UNKNOWN_ERROR: i32 = 21;
}

pub mod synth_event {
    pub const SYNTH_EVENT_SPEECH: i32 = 0;
    pub const SYNTH_EVENT_FINISHED: i32 = 1;
    pub const SYNTH_EVENT_ERROR: i32 = 2;
}

pub mod synth_mode {
    pub const SYNTH_MODE_LAZY: i32 = 0;
    pub const SYNTH_MODE_PARALLEL: i32 = 1;
    pub const SYNTH_MODE_REALTIME: i32 = 2;
}

pub struct SonataVoice(AssertUnwindSafe<Arc<SonataSpeechSynthesizer>>);

impl From<SonataSpeechSynthesizer> for SonataVoice {
    fn from(other: SonataSpeechSynthesizer) -> Self {
        Self(AssertUnwindSafe(Arc::new(other)))
    }
}

impl Deref for SonataVoice {
    type Target = SonataSpeechSynthesizer;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<T> AsRef<T> for SonataVoice
where
    T: ?Sized,
    <SonataVoice as Deref>::Target: AsRef<T>,
{
    fn as_ref(&self) -> &T {
        self.deref().as_ref()
    }
}

#[derive(Debug)]
pub struct SonataFFIError(i32, String);

impl SonataFFIError {
    fn invalid_utf8() -> Self {
        Self(
            error_codes::INVALID_UTF8_SEQUENCE,
            "Invalid utf-8 input.".to_string(),
        )
    }
    fn invalid_synthesis_mode() -> Self {
        Self(error_codes::INVALID_SYNTHESIS_MODE, "Invalid synthesis mode".to_string())
    }
}

impl From<SonataError> for SonataFFIError {
    fn from(other: SonataError) -> Self {
        let (code, message) = match other {
            SonataError::FailedToLoadResource(msg) => (error_codes::FAILED_TO_LOAD_RESOURCE, msg),
            SonataError::PhonemizationError(msg) => (error_codes::PHONEMIZATION_ERROR, msg),
            SonataError::OperationError(msg) => (error_codes::OPERATION_ERROR, msg),
        };
        Self(code, message)
    }
}

impl From<SonataFFIError> for ExternError {
    fn from(other: SonataFFIError) -> Self {
        let err_code = ErrorCode::new(other.0);
        ExternError::new_error(err_code, other.1)
    }
}

pub type SonataFFIResult<T> = Result<T, SonataFFIError>;

#[repr(C)]
pub struct SynthesisEvent {
    event_type: i32,
    error_ptr: *mut ExternError,
    len: i64, // usize causes issues with JNI
    data: *mut u8,
}

impl SynthesisEvent {
    fn with_speech(speech: Vec<u8>) -> Self {
        let mut buf = speech.into_boxed_slice();
        let data = buf.as_mut_ptr();
        let len = buf.len();
        std::mem::forget(buf);
        Self {
            event_type: synth_event::SYNTH_EVENT_SPEECH,
            error_ptr: std::ptr::null_mut(),
            len: len as i64,
            data,
        }
    }
    fn with_error(error: impl Into<ExternError>) -> Self {
        let mut event = Self::with_speech(Vec::with_capacity(0));
        event.event_type = synth_event::SYNTH_EVENT_ERROR;
        event.error_ptr = Box::into_raw(Box::new(error.into()));
        event
    }
    fn with_finished() -> Self {
        let mut event = Self::with_speech(Vec::with_capacity(0));
        event.event_type = synth_event::SYNTH_EVENT_FINISHED;
        event.error_ptr = std::ptr::null_mut();
        event
    }
}

#[repr(C)]
pub struct AudioInfo {
    sample_rate: u32,
    num_channels: u32,
    sample_width: u32,
}

#[derive(Clone)]
#[repr(C)]
pub struct SynthesisParams {
    mode: i32,
    rate: u8,
    volume: u8,
    pitch: u8,
    appended_silence_ms: u32,
    callback: SpeechSynthesisCallback,
    nonblocking: u8,
}

impl SynthesisParams {
    fn as_synth_output_config(&self) -> AudioOutputConfig {
        AudioOutputConfig {
            rate: Some(self.rate),
            volume: Some(self.volume),
            pitch: Some(self.pitch),
            appended_silence_ms: Some(self.appended_silence_ms),
        }
    }
}

#[repr(C)]
pub struct PiperSynthConfig {
    speaker: u32,
    length_scale: f32,
    noise_scale: f32,
    noise_w: f32,
}

impl PiperSynthConfig {
    fn as_piper_synth_config(&self) -> sonata_piper::PiperSynthesisConfig {
        sonata_piper::PiperSynthesisConfig {
            speaker: Some(self.speaker.into()),
            noise_scale: self.noise_scale,
            length_scale: self.length_scale,
            noise_w: self.noise_w,
        }
    }
}

/// # Safety
/// Pointer must be non-null and well alighned
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataFreeString(string_ptr: *mut i8) {
    _internal_libsonataFreeString(string_ptr)
}

/// # Safety
/// Pointer must be non-null and well alighned
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataFreePiperSynthConfig(synth_config: *mut PiperSynthConfig) {
    _internal_libsonataFreePiperSynthConfig(synth_config)
}
/// # Safety
/// Pointer must be non-null and well alighned

#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataFreeSynthesisEvent(event: SynthesisEvent) {
    ffi_support::abort_on_panic::with_abort_on_panic(|| {
        if !event.error_ptr.is_null() {
            drop(Box::from_raw(event.error_ptr));
        }
        let s = std::slice::from_raw_parts_mut(event.data, event.len as usize);
        drop(Box::from_raw(s as *mut [u8]));
    });
}

#[no_mangle]
#[allow(non_snake_case)]
pub extern "C" fn libsonataLoadVoiceFromConfigPath(
    config_path_ptr: FfiStr,
    out_error: &mut ExternError,
) -> *mut SonataVoice {
    call_with_result(out_error, move || _load_piper_voice(config_path_ptr))
}

/// # Safety
/// Pointer must be non-null and well alighned
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataUnloadSonataVoice(voice_ptr: *mut SonataVoice) {
    _internal_libsonataUnloadSonataVoice(voice_ptr)
}

/// # Safety
/// Pointer must be non-null and well alighned
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataGetAudioInfo(
    voice_ptr: *mut SonataVoice,
    audio_info_ptr: *mut AudioInfo,
    out_error: &mut ExternError,
) {
    let voice = voice_ptr.as_ref().unwrap();
    let audio_info_mut = audio_info_ptr.as_mut().unwrap();
    let mut audio_info = AssertUnwindSafe(audio_info_mut);
    call_with_result(out_error, move || {
        voice
            .audio_output_info()
            .map(|a| {
                audio_info.sample_rate = a.sample_rate as u32;
                audio_info.num_channels = a.num_channels as u32;
                audio_info.sample_width = a.sample_width as u32;
            })
            .map_err(SonataFFIError::from)
    })
}

/// # Safety
/// Pointer must be non-null and well alighned
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataGetPiperDefaultSynthConfig(
    voice_ptr: *mut SonataVoice,
    out_error: &mut ExternError,
) -> *mut PiperSynthConfig {
    let voice = voice_ptr.as_ref().unwrap();
    call_with_result(out_error, move || {
        let synth_config = voice
            .get_default_synthesis_config()
            .map_err(SonataFFIError::from)?;
        match synth_config.downcast_ref::<sonata_piper::PiperSynthesisConfig>() {
            Some(config) => Ok(PiperSynthConfig {
                speaker: config.speaker.map(|sid| sid as u32).unwrap_or_default(),
                length_scale: config.length_scale,
                noise_scale: config.noise_scale,
                noise_w: config.noise_w,
            }),
            None => Err(SonataFFIError(
                error_codes::UNKNOWN_ERROR,
                "Cannot retrieve Piper's default synthesis config".to_string(),
            )),
        }
    })
}

/// # Safety
/// Pointer must be non-null and well alighned
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataSetPiperSynthConfig(
    voice_ptr: *mut SonataVoice,
    synth_config: PiperSynthConfig,
    out_error: &mut ExternError,
) {
    let voice = voice_ptr.as_ref().unwrap();
    call_with_result(out_error, move || {
        let piper_synth_config = synth_config.as_piper_synth_config();
        let config = &piper_synth_config as &dyn Any;
        voice
            .set_fallback_synthesis_config(config)
            .map_err(SonataFFIError::from)
    })
}

/// # Safety
/// Pointer must be non-null and well alighned
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataSpeak(
    voice_ptr: *mut SonataVoice,
    text_ptr: FfiStr,
    params: SynthesisParams,
    out_error: &mut ExternError,
) {
    let voice = voice_ptr.as_ref().unwrap();
    let synth = AssertUnwindSafe(Arc::clone(&voice.0));
    call_with_result(out_error, move || _synthesize(synth, text_ptr, params))
}

/// # Safety
/// Pointer must be non-null and well alighned
#[no_mangle]
#[allow(non_snake_case)]
pub unsafe extern "C" fn libsonataSpeakToFile(
    voice_ptr: *mut SonataVoice,
    text_ptr: FfiStr,
    params: SynthesisParams,
    out_filename_ptr: FfiStr,
    out_error: &mut ExternError,
) -> u8 {
    let voice = voice_ptr.as_ref().unwrap();
    let synth = AssertUnwindSafe(Arc::clone(&voice.0));
    call_with_result(out_error, move || {
        Ok::<u8, SonataFFIError>(
            _synthesize_to_file(synth, text_ptr, params, out_filename_ptr).is_ok() as u8,
        )
    })
}

fn init_ort_environment()  {
    INIT_ORT_ENVIRONMENT.call_once(|| {
        let execution_providers = [
            #[cfg(target_os = "android")]
            ort::ExecutionProviderDispatch::NNAPI(Default::default()),
            #[cfg(target_os = "ios")]
            ort::ExecutionProviderDispatch::CoreML(Default::default()),
            ort::ExecutionProviderDispatch::CPU(Default::default()),
        ];
        ort::init()
            .with_name("sonata")
            .with_execution_providers(execution_providers)
            .commit()
            .unwrap();
    });
}

fn _load_piper_voice(config_path_ptr: FfiStr) -> SonataFFIResult<SonataVoice> {
    init_ort_environment();
    let config_path = config_path_ptr
        .into_opt_string()
        .ok_or_else(SonataFFIError::invalid_utf8)?;
    let config_path = PathBuf::from(config_path);
    let piper_model = sonata_piper::from_config_path(&config_path)?;
    let synth = SonataSpeechSynthesizer::new(piper_model)?;
    Ok(synth.into())
}

fn _synthesize(
    synth: AssertUnwindSafe<Arc<SonataSpeechSynthesizer>>,
    text_ptr: FfiStr,
    params: SynthesisParams,
) -> SonataFFIResult<()> {
    let text = text_ptr
        .into_opt_string()
        .ok_or_else(SonataFFIError::invalid_utf8)?;
    if params.nonblocking != 0 {
        SYNTHESIS_THREAD_POOL.spawn(move || {
            let callback = params.callback;
            if let Err(e) = _do_synthesize(synth, text, params) {
                let event = SynthesisEvent::with_error(e);
                callback(event);
            }
        });
    } else {
        _do_synthesize(synth, text, params)?;
    }
    Ok(())
}

fn _do_synthesize(
    synth: AssertUnwindSafe<Arc<SonataSpeechSynthesizer>>,
    text: String,
    params: SynthesisParams,
) -> SonataFFIResult<()> {
    let audio_output_config = Some(params.as_synth_output_config());
    match params.mode {
        synth_mode::SYNTH_MODE_LAZY => {
            let stream = synth
                .synthesize_lazy(text, false, audio_output_config)?
                .map(|wr| wr.map(|aud| aud.samples));
            iterate_stream(stream, params.callback)
        }
        synth_mode::SYNTH_MODE_PARALLEL => {
            let stream = synth
                .synthesize_parallel(text, false, audio_output_config)?
                .map(|wr| wr.map(|aud| aud.samples));
            iterate_stream(stream, params.callback)
        }
        synth_mode::SYNTH_MODE_REALTIME => {
            let stream = synth.synthesize_streamed(text, false, audio_output_config, 72, 3)?;
            iterate_stream(stream, params.callback)
        }
        _ => Err(SonataFFIError::invalid_synthesis_mode())
    }
}

#[inline(always)]
fn iterate_stream(
    stream: impl Iterator<Item = SonataResult<AudioSamples>> + Send + Sync + 'static,
    callback: SpeechSynthesisCallback,
) -> SonataFFIResult<()> {
    for result in stream {
        match result {
            Ok(audio) => {
                let wav_bytes = audio.as_wave_bytes();
                let event = SynthesisEvent::with_speech(wav_bytes);
                if callback(event) != 0 {
                    return Ok(());
                }
            }
            Err(e) => {
                let event = SynthesisEvent::with_error(SonataFFIError::from(e));
                callback(event);
                return Ok(());
            }
        };
    }
    callback(SynthesisEvent::with_finished());
    Ok(())
}

fn _synthesize_to_file(
    synth: AssertUnwindSafe<Arc<SonataSpeechSynthesizer>>,
    text_ptr: FfiStr,
    params: SynthesisParams,
    out_filename_ptr: FfiStr,
) -> SonataFFIResult<()> {
    let text = text_ptr
        .into_opt_string()
        .ok_or_else(SonataFFIError::invalid_utf8)?;
    let out_filename = out_filename_ptr
        .into_opt_string()
        .ok_or_else(SonataFFIError::invalid_utf8)
        .map(PathBuf::from)?;
    synth.synthesize_to_file(&out_filename, text, Some(params.as_synth_output_config()))?;
    Ok(())
}
