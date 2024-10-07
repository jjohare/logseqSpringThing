/* Generated with cbindgen:0.26.0 */

#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

#define INVALID_SYNTHESIS_MODE 16

#define FAILED_TO_LOAD_RESOURCE 17

#define PHONEMIZATION_ERROR 18

#define OPERATION_ERROR 19

#define INVALID_UTF8_SEQUENCE 20

#define UNKNOWN_ERROR 21

#define SYNTH_EVENT_SPEECH 0

#define SYNTH_EVENT_FINISHED 1

#define SYNTH_EVENT_ERROR 2

#define SYNTH_MODE_LAZY 0

#define SYNTH_MODE_PARALLEL 1

#define SYNTH_MODE_REALTIME 2

typedef struct SonataVoice SonataVoice;

typedef struct PiperSynthConfig {
  uint32_t speaker;
  float length_scale;
  float noise_scale;
  float noise_w;
} PiperSynthConfig;

typedef int32_t ErrorCode;
#define ErrorCode_SUCCESS 0
#define ErrorCode_PANIC -1
#define ErrorCode_INVALID_HANDLE -1000

typedef struct ExternError {
  ErrorCode code;
  char *message;
} ExternError;

typedef struct SynthesisEvent {
  int32_t event_type;
  struct ExternError *error_ptr;
  int64_t len;
  uint8_t *data;
} SynthesisEvent;

typedef const char *FfiStr;

typedef struct AudioInfo {
  uint32_t sample_rate;
  uint32_t num_channels;
  uint32_t sample_width;
} AudioInfo;

typedef uint8_t (*SpeechSynthesisCallback)(struct SynthesisEvent);

typedef struct SynthesisParams {
  int32_t mode;
  uint8_t rate;
  uint8_t volume;
  uint8_t pitch;
  uint32_t appended_silence_ms;
  SpeechSynthesisCallback callback;
  uint8_t nonblocking;
} SynthesisParams;

void libsonataFreeString(int8_t *string_ptr);

void libsonataFreePiperSynthConfig(struct PiperSynthConfig *synth_config);

void libsonataFreeSynthesisEvent(struct SynthesisEvent event);

struct SonataVoice *libsonataLoadVoiceFromConfigPath(FfiStr config_path_ptr,
                                                     struct ExternError *out_error);

void libsonataUnloadSonataVoice(struct SonataVoice *voice_ptr);

void libsonataGetAudioInfo(struct SonataVoice *voice_ptr,
                           struct AudioInfo *audio_info_ptr,
                           struct ExternError *out_error);

struct PiperSynthConfig *libsonataGetPiperDefaultSynthConfig(struct SonataVoice *voice_ptr,
                                                             struct ExternError *out_error);

void libsonataSetPiperSynthConfig(struct SonataVoice *voice_ptr,
                                  struct PiperSynthConfig synth_config,
                                  struct ExternError *out_error);

void libsonataSpeak(struct SonataVoice *voice_ptr,
                    FfiStr text_ptr,
                    struct SynthesisParams params,
                    struct ExternError *out_error);

uint8_t libsonataSpeakToFile(struct SonataVoice *voice_ptr,
                             FfiStr text_ptr,
                             struct SynthesisParams params,
                             FfiStr out_filename_ptr,
                             struct ExternError *out_error);
