/*
 * UNIHIKER K10 + MiMo V2.5 TTS bring-up test.
 *
 * A: non-streaming TTS (WAV response), then play it.
 * B: streaming TTS (pcm16 SSE response), play chunks as they arrive.
 *
 * Put credentials in local_secrets.h (ignored by git), or define them below
 * before compiling. Never commit an API key.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "unihiker_k10.h"
#include "mbedtls/base64.h"
#include "driver/i2s.h"

#if __has_include("local_secrets.h")
#include "local_secrets.h"
#else
#define TTS_WIFI_SSID "YOUR_WIFI_SSID"
#define TTS_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define TTS_API_KEY "YOUR_MIMO_API_KEY"
#endif

static const char *TTS_URL = "https://api.xiaomimimo.com/v1/chat/completions";
static const char *TTS_MODEL = "mimo-v2.5-tts";
static const char *TTS_VOICE = "冰糖";
static const uint32_t TTS_SAMPLE_RATE = 24000;

UNIHIKER_K10 k10;
extern SemaphoreHandle_t xI2SMutex;

static void status(const String &title, const String &detail = "") {
  Serial.println(title + (detail.length() ? " " + detail : ""));
  k10.canvas->canvasClear();
  k10.canvas->canvasText(title, 4, 20, 0x0000FF, k10.canvas->eCNAndENFont16, 50, true);
  if (detail.length()) k10.canvas->canvasText(detail, 4, 50, 0x0000FF, k10.canvas->eCNAndENFont16, 50, true);
  k10.canvas->updateCanvas();
}

static bool decodeBase64(const String &encoded, uint8_t **out, size_t *outLen) {
  size_t cap = (encoded.length() / 4) * 3 + 4;
  *out = (uint8_t *)ps_malloc(cap);
  if (!*out) return false;
  size_t actual = 0;
  int rc = mbedtls_base64_decode(*out, cap, &actual,
                                 (const unsigned char *)encoded.c_str(), encoded.length());
  if (rc != 0) { free(*out); *out = nullptr; return false; }
  *outLen = actual;
  return true;
}

static uint32_t pcmOldRate = 0;
static bool pcmSession = false;

static void writePcmMono16Locked(const uint8_t *pcm, size_t pcmBytes) {
  if (!pcm || pcmBytes < 2) return;
    const size_t monoSamples = 512;
    int16_t stereo[monoSamples * 2];
    for (size_t pos = 0; pos + 1 < pcmBytes; ) {
      size_t samples = (pcmBytes - pos) / 2;
      if (samples > monoSamples) samples = monoSamples;
      for (size_t i = 0; i < samples; ++i) {
        int16_t s = (int16_t)(pcm[pos + i * 2] | ((uint16_t)pcm[pos + i * 2 + 1] << 8));
        stereo[i * 2] = s;
        stereo[i * 2 + 1] = s;
      }
      size_t written = 0;
      i2s_write(I2S_NUM_0, stereo, samples * sizeof(stereo[0]) * 2, &written, portMAX_DELAY);
      pos += samples * 2;
      yield();
    }
}

static void beginPcmPlayback(uint32_t sampleRate) {
  pcmOldRate = i2s_get_clk(I2S_NUM_0);
  i2s_set_sample_rates(I2S_NUM_0, sampleRate);
  pcmSession = xSemaphoreTake(xI2SMutex, portMAX_DELAY) == pdTRUE;
}

static void endPcmPlayback() {
  if (!pcmSession) return;
    i2s_zero_dma_buffer(I2S_NUM_0);
    xSemaphoreGive(xI2SMutex);
    i2s_set_sample_rates(I2S_NUM_0, pcmOldRate);
    pcmSession = false;
}

static void playPcmMono16(const uint8_t *pcm, size_t pcmBytes, uint32_t sampleRate) {
  beginPcmPlayback(sampleRate);
  if (pcmSession) writePcmMono16Locked(pcm, pcmBytes);
  endPcmPlayback();
}

static bool playWavBase64(const String &encoded) {
  uint8_t *wav = nullptr; size_t wavLen = 0;
  if (!decodeBase64(encoded, &wav, &wavLen) || wavLen < 44) return false;
  uint32_t rate = wav[24] | ((uint32_t)wav[25] << 8) | ((uint32_t)wav[26] << 16) | ((uint32_t)wav[27] << 24);
  uint16_t channels = wav[22] | ((uint16_t)wav[23] << 8);
  uint16_t bits = wav[34] | ((uint16_t)wav[35] << 8);
  bool ok = (channels == 1 && bits == 16 && rate > 0);
  if (ok) playPcmMono16(wav + 44, wavLen - 44, rate);
  free(wav);
  return ok;
}

static String makePayload(bool stream) {
  DynamicJsonDocument doc(2048);
  doc["model"] = TTS_MODEL;
  JsonArray messages = doc.createNestedArray("messages");
  JsonObject user = messages.createNestedObject(); user["role"] = "user";
  user["content"] = "用自然、清晰、亲切的普通话播报。";
  JsonObject assistant = messages.createNestedObject(); assistant["role"] = "assistant";
  assistant["content"] = "你好，这是 K10 的 MiMo 语音合成测试。";
  JsonObject audio = doc.createNestedObject("audio");
  audio["format"] = stream ? "pcm16" : "wav";
  audio["voice"] = TTS_VOICE;
  if (stream) doc["stream"] = true;
  String body; serializeJson(doc, body); return body;
}

static bool postNonStreaming() {
  WiFiClientSecure client; client.setInsecure(); client.setTimeout(60);
  HTTPClient http;
  if (!http.begin(client, TTS_URL)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("api-key", TTS_API_KEY);
  int code = http.POST(makePayload(false));
  String body = http.getString();
  Serial.printf("non-stream HTTP %d, %u bytes\n", code, body.length());
  if (code != 200) { Serial.println(body.substring(0, 500)); http.end(); return false; }
  // The WAV Base64 payload is large (often >200 KB), so avoid copying it into
  // an ArduinoJson document. Base64 contains no quote characters and can be
  // safely extracted in-place from the response body.
  int dataMark = body.lastIndexOf("\"data\":\"");
  bool ok = false;
  if (dataMark >= 0) {
    int begin = dataMark + 8;
    int end = body.indexOf('"', begin);
    if (end > begin) ok = playWavBase64(body.substring(begin, end));
  }
  http.end(); return ok;
}

static bool postStreaming() {
  WiFiClientSecure client; client.setInsecure(); client.setTimeout(60);
  HTTPClient http;
  if (!http.begin(client, TTS_URL)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("api-key", TTS_API_KEY);
  int code = http.POST(makePayload(true));
  Serial.printf("stream HTTP %d\n", code);
  if (code != 200) { Serial.println(http.getString().substring(0, 500)); http.end(); return false; }
  bool gotAudio = false;
  beginPcmPlayback(TTS_SAMPLE_RATE);
  // HTTPClient decodes Transfer-Encoding: chunked in getString(). Reading
  // getStreamPtr() directly would expose chunk-size lines instead of SSE.
  String response = http.getString();
  Serial.printf("stream response %u bytes\n", response.length());
  int cursor = 0;
  while (cursor < response.length()) {
    int next = response.indexOf('\n', cursor);
    if (next < 0) next = response.length();
    String line = response.substring(cursor, next);
    line.trim();
    cursor = next + 1;
    if (!line.startsWith("data:")) continue;
    String json = line.substring(5); json.trim();
    if (json == "[DONE]") break;
    // Audio chunks are large; avoid copying each Base64 string into a small
    // ArduinoJson document. The audio data itself is the last JSON "data" field.
    int dataMark = json.lastIndexOf("\"data\":\"");
    if (dataMark < 0) continue;
    int begin = dataMark + 8;
    int end = json.indexOf('"', begin);
    if (end <= begin) continue;
    uint8_t *pcm = nullptr; size_t pcmLen = 0;
    if (decodeBase64(json.substring(begin, end), &pcm, &pcmLen)) {
      if (pcmSession) writePcmMono16Locked(pcm, pcmLen);
      free(pcm); gotAudio = true;
    }
  }
  endPcmPlayback();
  http.end(); return gotAudio;
}

void setup() {
  Serial.begin(115200); delay(1000); k10.begin(); k10.initScreen(2); k10.creatCanvas();
  status("MiMo TTS 测试", "连接 WiFi...");
  WiFi.mode(WIFI_STA); WiFi.begin(TTS_WIFI_SSID, TTS_WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; ++i) delay(500);
  if (WiFi.status() != WL_CONNECTED) { status("WiFi 连接失败"); return; }
  status("按键测试", "A=非流式 B=流式");
  Serial.println("Ready: press A for non-stream WAV, B for stream PCM16.");
}

void loop() {
  if (k10.buttonA->isPressed()) { status("非流式合成", "请求中..."); bool ok = postNonStreaming(); status(ok ? "非流式播放完成" : "非流式失败"); delay(1000); }
  if (k10.buttonB->isPressed()) { status("流式合成", "请求中..."); bool ok = postStreaming(); status(ok ? "流式播放完成" : "流式失败"); delay(1000); }
  delay(30);
}
