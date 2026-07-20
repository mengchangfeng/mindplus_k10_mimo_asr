//% color="#2563EB" iconWidth=45 iconHeight=45
namespace k10_mimo_asr {

    function addRuntime() {
        Generator.addInclude("k10_mimo_asr_wifi", "#include <WiFi.h>");
        Generator.addInclude("k10_mimo_asr_tls", "#include <WiFiClientSecure.h>");
        Generator.addInclude("k10_mimo_asr_http", "#include <HTTPClient.h>");
        Generator.addInclude("k10_mimo_asr_wire", "#include <Wire.h>");
        Generator.addInclude("k10_mimo_asr_i2s", "#include \"driver/i2s.h\"");
        Generator.addInclude("k10_mimo_asr_base64", "#include \"mbedtls/base64.h\"");
        Generator.addInclude("k10_mimo_asr_k10", "#include \"unihiker_k10.h\"");

        Generator.addObject("k10_mimo_asr_mutex", "extern SemaphoreHandle_t", "xI2SMutex;");
        Generator.addObject("k10_mimo_asr_globals", "String", `_k10MimoAsrApiKey = "";
String _k10MimoAsrModel = "mimo-v2.5-asr";
String _k10MimoAsrApiUrl = "https://api.xiaomimimo.com/v1";
String _k10MimoTtsModel = "mimo-v2.5-tts";
String _k10MimoTtsVoice = "冰糖";
const uint32_t _k10MimoAsrSampleRate = 16000;
const uint16_t _k10MimoAsrBitsPerSample = 16;
const uint16_t _k10MimoAsrChannels = 1;
uint8_t _k10MimoAsrMaxSeconds = 5;
uint8_t *_k10MimoAsrPcmBuffer = NULL;
uint32_t _k10MimoAsrPcmBytes = 0;
uint32_t _k10MimoAsrLastElapsedMs = 0;
volatile bool _k10MimoAsrRecording = false;
volatile bool _k10MimoAsrTaskRunning = false;
TaskHandle_t _k10MimoAsrTaskHandle = NULL;
bool _k10MimoAsrInited = false;`);

        Generator.addObject("k10_mimo_asr_write_wav", "void", `_k10MimoAsrWriteWavHeader(uint8_t *wav, uint32_t pcmDataSize) {
  uint32_t fileSize = pcmDataSize + 36;
  uint32_t byteRate = _k10MimoAsrSampleRate * _k10MimoAsrChannels * _k10MimoAsrBitsPerSample / 8;
  uint16_t blockAlign = _k10MimoAsrChannels * _k10MimoAsrBitsPerSample / 8;

  memcpy(wav + 0, "RIFF", 4);
  wav[4] = fileSize & 0xff;
  wav[5] = (fileSize >> 8) & 0xff;
  wav[6] = (fileSize >> 16) & 0xff;
  wav[7] = (fileSize >> 24) & 0xff;
  memcpy(wav + 8, "WAVE", 4);
  memcpy(wav + 12, "fmt ", 4);
  wav[16] = 16;
  wav[17] = 0;
  wav[18] = 0;
  wav[19] = 0;
  wav[20] = 1;
  wav[21] = 0;
  wav[22] = _k10MimoAsrChannels;
  wav[23] = 0;
  wav[24] = _k10MimoAsrSampleRate & 0xff;
  wav[25] = (_k10MimoAsrSampleRate >> 8) & 0xff;
  wav[26] = (_k10MimoAsrSampleRate >> 16) & 0xff;
  wav[27] = (_k10MimoAsrSampleRate >> 24) & 0xff;
  wav[28] = byteRate & 0xff;
  wav[29] = (byteRate >> 8) & 0xff;
  wav[30] = (byteRate >> 16) & 0xff;
  wav[31] = (byteRate >> 24) & 0xff;
  wav[32] = blockAlign & 0xff;
  wav[33] = (blockAlign >> 8) & 0xff;
  wav[34] = _k10MimoAsrBitsPerSample;
  wav[35] = 0;
  memcpy(wav + 36, "data", 4);
  wav[40] = pcmDataSize & 0xff;
  wav[41] = (pcmDataSize >> 8) & 0xff;
  wav[42] = (pcmDataSize >> 16) & 0xff;
  wav[43] = (pcmDataSize >> 24) & 0xff;
}`);

        Generator.addObject("k10_mimo_asr_base64_fn", "String", `_k10MimoAsrBase64Encode(uint8_t *data, size_t dataLen) {
  size_t base64Len = ((dataLen + 2) / 3) * 4;
  unsigned char *base64Buf = (unsigned char *)ps_malloc(base64Len + 1);

  if (!base64Buf) return "";

  size_t olen = 0;
  int ret = mbedtls_base64_encode(base64Buf, base64Len + 1, &olen, data, dataLen);
  if (ret != 0) {
    free(base64Buf);
    return "";
  }

  base64Buf[olen] = '\\0';
  String result = String((char *)base64Buf);
  free(base64Buf);
  return result;
}`);

        Generator.addObject("k10_mimo_asr_parse_fn", "String", `_k10MimoAsrParseText(String response) {
  int key = response.indexOf("\\"content\\"");
  if (key < 0) return "";

  int colon = response.indexOf(':', key);
  if (colon < 0) return "";
  int first = response.indexOf('"', colon + 1);
  if (first < 0) return "";

  String text;
  text.reserve(64);
  for (int pos = first + 1; pos < response.length(); pos++) {
    char c = response.charAt(pos);
    if (c == '"') return text;
    if (c != '\\\\') {
      text += c;
      continue;
    }

    pos++;
    if (pos >= response.length()) return "";
    char escaped = response.charAt(pos);
    if (escaped == 'n') text += '\\n';
    else if (escaped == 'r') text += '\\r';
    else if (escaped == 't') text += '\\t';
    else if (escaped == 'b') text += '\\b';
    else if (escaped == 'f') text += '\\f';
    else if (escaped == '"') text += '"';
    else if (escaped == '\\\\') text += '\\\\';
    else if (escaped == '/') text += '/';
    else {
      text += '\\\\';
      text += escaped;
    }
  }
  return "";
}`);

        Generator.addObject("k10_mimo_asr_write_client_fn", "template <typename ClientType>\nbool", `_k10MimoAsrWriteAll(ClientType &client, const char *data, size_t len) {
  size_t sent = 0;
  unsigned long lastWriteMs = millis();

  while (sent < len) {
    size_t chunk = len - sent;
    if (chunk > 1024) chunk = 1024;

    int written = client.write((const uint8_t *)data + sent, chunk);
    if (written > 0) {
      sent += written;
      lastWriteMs = millis();
      yield();
      continue;
    }

    if (millis() - lastWriteMs > 10000) return false;
    delay(10);
    yield();
  }
  return true;
}`);

        Generator.addObject("k10_mimo_asr_write_client_string_fn", "template <typename ClientType>\nbool", `_k10MimoAsrWriteAll(ClientType &client, const String &data) {
  return _k10MimoAsrWriteAll(client, data.c_str(), data.length());
}`);

        Generator.addObject("k10_mimo_asr_read_body_fn", "String", `_k10MimoAsrReadHttpBody(WiFiClientSecure &client, bool chunked, int contentLength) {
  String body;
  body.reserve(2048);

  if (chunked) {
    while (client.connected() || client.available()) {
      String sizeLine = client.readStringUntil('\\n');
      sizeLine.trim();
      if (sizeLine.length() == 0) continue;

      int chunkSize = (int)strtol(sizeLine.c_str(), NULL, 16);
      if (chunkSize <= 0) {
        client.readStringUntil('\\n');
        break;
      }

      for (int i = 0; i < chunkSize; i++) {
        int c = client.read();
        if (c < 0) {
          i--;
          delay(1);
          continue;
        }
        if (body.length() < 4096) body += (char)c;
      }

      client.read();
      client.read();
      yield();
    }
    return body;
  }

  unsigned long lastDataMs = millis();
  while (client.connected() || client.available()) {
    while (client.available()) {
      char c = (char)client.read();
      if (body.length() < 4096) body += c;
      lastDataMs = millis();
      if (contentLength > 0 && body.length() >= (size_t)contentLength) return body;
    }

    if (millis() - lastDataMs > 5000) break;
    delay(10);
    yield();
  }
  return body;
}`);

        Generator.addObject("k10_mimo_tts_json_escape_fn", "String", `_k10MimoTtsJsonEscape(const String &text) {
  String out;
  out.reserve(text.length() + 16);
  for (size_t i = 0; i < text.length(); i++) {
    char c = text.charAt(i);
    if (c == '"' || c == '\\\\') { out += '\\\\'; out += c; }
    else if (c == '\\n') out += "\\\\n";
    else if (c == '\\r') out += "\\\\r";
    else if (c == '\\t') out += "\\\\t";
    else out += c;
  }
  return out;
}`);

        Generator.addObject("k10_mimo_tts_play_fn", "bool", `_k10MimoTtsPlayWav(uint8_t *wav, size_t wavLen) {
  if (!wav || wavLen < 44) return false;
  uint32_t sampleRate = (uint32_t)wav[24] | ((uint32_t)wav[25] << 8) |
                        ((uint32_t)wav[26] << 16) | ((uint32_t)wav[27] << 24);
  uint16_t channels = (uint16_t)wav[22] | ((uint16_t)wav[23] << 8);
  uint16_t bits = (uint16_t)wav[34] | ((uint16_t)wav[35] << 8);
  if (sampleRate == 0 || channels != 1 || bits != 16) return false;

  uint32_t oldRate = i2s_get_clk(I2S_NUM_0);
  i2s_set_sample_rates(I2S_NUM_0, sampleRate);
  bool played = false;
  if (xSemaphoreTake(xI2SMutex, portMAX_DELAY) == pdTRUE) {
    const size_t monoSamples = 512;
    int16_t stereo[monoSamples * 2];
    size_t pos = 44;
    while (pos + 1 < wavLen) {
      size_t samples = (wavLen - pos) / 2;
      if (samples > monoSamples) samples = monoSamples;
      for (size_t i = 0; i < samples; i++) {
        int16_t sample = (int16_t)((uint16_t)wav[pos + i * 2] |
                                   ((uint16_t)wav[pos + i * 2 + 1] << 8));
        stereo[i * 2] = sample;
        stereo[i * 2 + 1] = sample;
      }
      size_t written = 0;
      i2s_write(I2S_NUM_0, stereo, samples * sizeof(int16_t) * 2, &written, portMAX_DELAY);
      pos += samples * 2;
      yield();
    }
    i2s_zero_dma_buffer(I2S_NUM_0);
    xSemaphoreGive(xI2SMutex);
    played = true;
  }
  i2s_set_sample_rates(I2S_NUM_0, oldRate);
  return played;
}`);

        Generator.addObject("k10_mimo_tts_speak_fn", "String", `_k10MimoTtsSpeak(const String &text, const String &style) {
  if (!_k10MimoAsrInited) return "未初始化";
  if (text.length() == 0) return "文本为空";
  if (text.length() > 1800) return "文本过长";

  String instruction = style;
  instruction.trim();

  String body = "{\\"model\\":\\"" + _k10MimoTtsModel +
                "\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"" +
                _k10MimoTtsJsonEscape(instruction) +
                "\\"},{\\"role\\":\\"assistant\\",\\"content\\":\\"" +
                _k10MimoTtsJsonEscape(text) +
                "\\"}],\\"audio\\":{\\"format\\":\\"wav\\",\\"voice\\":\\"" +
                _k10MimoTtsJsonEscape(_k10MimoTtsVoice) + "\\"}}";

  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(60000);
  if (!http.begin(client, "https://api.xiaomimimo.com/v1/chat/completions")) return "HTTPS初始化失败";
  http.addHeader("Content-Type", "application/json");
  http.addHeader("api-key", _k10MimoAsrApiKey);
  int code = http.POST(body);
  String response = http.getString();
  http.end();
  body = "";

  if (code != 200) {
    response = response.substring(0, 120);
    return "HTTP " + String(code) + (response.length() ? ": " + response : "");
  }

  int mark = response.lastIndexOf("\\"data\\":\\"");
  if (mark < 0) { response = ""; return "未找到音频数据"; }
  int begin = mark + 8;
  int end = response.indexOf('\\"', begin);
  if (end <= begin) { response = ""; return "音频数据格式错误"; }

  const char *encoded = response.c_str() + begin;
  size_t encodedLen = (size_t)(end - begin);
  size_t decodedCap = (encodedLen / 4) * 3 + 4;
  uint8_t *wav = (uint8_t *)ps_malloc(decodedCap);
  if (!wav) { response = ""; return "音频内存不足"; }
  size_t wavLen = 0;
  int ret = mbedtls_base64_decode(wav, decodedCap, &wavLen,
                                  (const unsigned char *)encoded, encodedLen);
  response = "";
  if (ret != 0) { free(wav); return "音频Base64解码失败"; }
  bool ok = _k10MimoTtsPlayWav(wav, wavLen);
  free(wav);
  return ok ? "" : "音频播放失败";
}`);

        Generator.addObject("k10_mimo_asr_es7243_write_fn", "void", `_k10MimoAsrEs7243Write(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(0x11);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}`);

        Generator.addObject("k10_mimo_asr_es7243_init_fn", "bool", `_k10MimoAsrInitES7243E() {
  Wire.beginTransmission(0x11);
  Wire.write(0xFD);
  if (Wire.endTransmission() != 0) return false;
  Wire.requestFrom((uint8_t)0x11, (uint8_t)1);
  if (Wire.available()) Wire.read();

  _k10MimoAsrEs7243Write(0x01, 0x3A);
  _k10MimoAsrEs7243Write(0x00, 0x80);
  _k10MimoAsrEs7243Write(0xF9, 0x00);
  _k10MimoAsrEs7243Write(0x04, 0x02);
  _k10MimoAsrEs7243Write(0x04, 0x01);
  _k10MimoAsrEs7243Write(0xF9, 0x01);
  _k10MimoAsrEs7243Write(0x00, 0x1E);
  _k10MimoAsrEs7243Write(0x01, 0x00);
  _k10MimoAsrEs7243Write(0x02, 0x00);
  _k10MimoAsrEs7243Write(0x03, 0x20);
  _k10MimoAsrEs7243Write(0x04, 0x01);
  _k10MimoAsrEs7243Write(0x0D, 0x00);
  _k10MimoAsrEs7243Write(0x05, 0x00);
  _k10MimoAsrEs7243Write(0x06, 0x03);
  _k10MimoAsrEs7243Write(0x07, 0x00);
  _k10MimoAsrEs7243Write(0x08, 0xFF);
  _k10MimoAsrEs7243Write(0x09, 0xCA);
  _k10MimoAsrEs7243Write(0x0A, 0x81);
  _k10MimoAsrEs7243Write(0x0B, 0x00);
  _k10MimoAsrEs7243Write(0x0E, 0xBF);
  _k10MimoAsrEs7243Write(0x0F, 0x80);
  _k10MimoAsrEs7243Write(0x14, 0x0C);
  _k10MimoAsrEs7243Write(0x15, 0x0C);
  _k10MimoAsrEs7243Write(0x17, 0x02);
  _k10MimoAsrEs7243Write(0x18, 0x26);
  _k10MimoAsrEs7243Write(0x19, 0x77);
  _k10MimoAsrEs7243Write(0x1A, 0xF4);
  _k10MimoAsrEs7243Write(0x1B, 0x66);
  _k10MimoAsrEs7243Write(0x1C, 0x44);
  _k10MimoAsrEs7243Write(0x1E, 0x00);
  _k10MimoAsrEs7243Write(0x1F, 0x0C);
  _k10MimoAsrEs7243Write(0x20, 0x1A);
  _k10MimoAsrEs7243Write(0x21, 0x1A);
  _k10MimoAsrEs7243Write(0x00, 0x80);
  _k10MimoAsrEs7243Write(0x01, 0x3A);
  _k10MimoAsrEs7243Write(0x16, 0x3F);
  _k10MimoAsrEs7243Write(0x16, 0x00);
  _k10MimoAsrEs7243Write(0xF9, 0x00);
  _k10MimoAsrEs7243Write(0x04, 0x01);
  _k10MimoAsrEs7243Write(0x17, 0x01);
  return true;
}`);

        Generator.addObject("k10_mimo_asr_record_task_fn", "void", `_k10MimoAsrRecordTask(void *param) {
  const int readBufSize = 6400;
  uint8_t *rawBuffer = (uint8_t *)ps_malloc(readBufSize);
  size_t bytesRead = 0;

  _k10MimoAsrTaskRunning = true;
  _k10MimoAsrPcmBytes = 0;
  _k10MimoAsrLastElapsedMs = 0;

  if (!rawBuffer || !_k10MimoAsrPcmBuffer) {
    if (rawBuffer) free(rawBuffer);
    _k10MimoAsrRecording = false;
    _k10MimoAsrTaskRunning = false;
    vTaskDelete(NULL);
    return;
  }

  for (int i = 0; i < 5; i++) {
    if (xSemaphoreTake(xI2SMutex, 50 / portTICK_PERIOD_MS) == pdTRUE) {
      i2s_read(I2S_NUM_0, rawBuffer, readBufSize, &bytesRead, 0);
      xSemaphoreGive(xI2SMutex);
    }
    delay(2);
  }

  uint32_t maxBytes = (uint32_t)_k10MimoAsrMaxSeconds * _k10MimoAsrSampleRate * 2;
  unsigned long startMs = millis();

  while (_k10MimoAsrRecording && _k10MimoAsrPcmBytes + (readBufSize / 2) < maxBytes) {
    if (xSemaphoreTake(xI2SMutex, 250 / portTICK_PERIOD_MS) != pdTRUE) {
      yield();
      continue;
    }

    esp_err_t err = i2s_read(I2S_NUM_0, rawBuffer, readBufSize, &bytesRead, 200 / portTICK_PERIOD_MS);
    xSemaphoreGive(xI2SMutex);

    if (err != ESP_OK || bytesRead == 0) {
      yield();
      continue;
    }

    int maxPairs = bytesRead / 4;
    for (int i = 0; i < maxPairs && _k10MimoAsrPcmBytes + 2 < maxBytes; i++) {
      int idx = i * 4;
      _k10MimoAsrPcmBuffer[_k10MimoAsrPcmBytes++] = rawBuffer[idx + 2];
      _k10MimoAsrPcmBuffer[_k10MimoAsrPcmBytes++] = rawBuffer[idx + 3];
    }

    yield();
  }

  _k10MimoAsrRecording = false;
  _k10MimoAsrLastElapsedMs = millis() - startMs;
  free(rawBuffer);
  _k10MimoAsrTaskRunning = false;
  vTaskDelete(NULL);
}`);

        Generator.addObject("k10_mimo_asr_send_fn", "String", `_k10MimoAsrSendWav(uint8_t *wavBuffer, uint32_t wavBytes) {
  String audioBase64 = _k10MimoAsrBase64Encode(wavBuffer, wavBytes);
  if (audioBase64.length() == 0) return "Base64编码失败";

  String jsonPrefix = "{\\\"model\\\":\\\"" + _k10MimoAsrModel +
                      "\\\",\\\"messages\\\":[{\\\"role\\\":\\\"user\\\",\\\"content\\\":[{\\\"type\\\":\\\"input_audio\\\",\\\"input_audio\\\":{\\\"data\\\":\\\"";
  String jsonSuffix = "\\\",\\\"format\\\":\\\"wav\\\"}}]}],\\\"asr_options\\\":{\\\"language\\\":\\\"zh\\\"}}";
  uint32_t contentLength = jsonPrefix.length() + audioBase64.length() + jsonSuffix.length();

  String apiUrl = _k10MimoAsrApiUrl;
  apiUrl.trim();
  apiUrl.replace("https://", "");
  apiUrl.replace("http://", "");

  int slashIndex = apiUrl.indexOf('/');
  String host = slashIndex >= 0 ? apiUrl.substring(0, slashIndex) : apiUrl;
  String pathBase = slashIndex >= 0 ? apiUrl.substring(slashIndex) : "/v1";
  if (pathBase.length() == 0) pathBase = "/v1";
  if (pathBase.endsWith("/")) pathBase.remove(pathBase.length() - 1);

  String requestPath = pathBase;
  if (!requestPath.endsWith("/chat/completions")) {
    requestPath += "/chat/completions";
  }

  String headers;
  headers.reserve(300);
  headers += "POST ";
  headers += requestPath;
  headers += " HTTP/1.1\\r\\n";
  headers += "Host: ";
  headers += host;
  headers += "\\r\\n";
  headers += "Content-Type: application/json\\r\\n";
  headers += "api-key: ";
  headers += _k10MimoAsrApiKey;
  headers += "\\r\\n";
  headers += "Content-Length: ";
  headers += String(contentLength);
  headers += "\\r\\n";
  headers += "Connection: close\\r\\n\\r\\n";

  String lastError = "请求失败";
  for (int attempt = 0; attempt < 2; attempt++) {
    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(30000);

    if (!client.connect(host.c_str(), 443)) {
      lastError = "HTTPS连接失败";
      client.stop();
      delay(300);
      continue;
    }

    if (!_k10MimoAsrWriteAll(client, headers) ||
        !_k10MimoAsrWriteAll(client, jsonPrefix) ||
        !_k10MimoAsrWriteAll(client, audioBase64) ||
        !_k10MimoAsrWriteAll(client, jsonSuffix)) {
      lastError = "请求失败: send payload";
      client.stop();
      delay(300);
      continue;
    }

    String statusLine = client.readStringUntil('\\n');
    statusLine.trim();
    int httpCode = 0;
    int firstSpace = statusLine.indexOf(' ');
    if (firstSpace >= 0) httpCode = statusLine.substring(firstSpace + 1, firstSpace + 4).toInt();

    if (httpCode <= 0) {
      lastError = "请求失败: no status";
      if (statusLine.length() > 0) lastError += " " + statusLine.substring(0, 30);
      client.stop();
      delay(300);
      continue;
    }

    bool chunked = false;
    int responseLength = -1;
    while (client.connected() || client.available()) {
      String line = client.readStringUntil('\\n');
      line.trim();
      if (line.length() == 0) break;

      String lower = line;
      lower.toLowerCase();
      if (lower.startsWith("transfer-encoding:") && lower.indexOf("chunked") >= 0) {
        chunked = true;
      } else if (lower.startsWith("content-length:")) {
        responseLength = lower.substring(String("content-length:").length()).toInt();
      }
    }

    String response = _k10MimoAsrReadHttpBody(client, chunked, responseLength);
    client.stop();

    if (httpCode != 200) {
      lastError = "HTTP " + String(httpCode);
      delay(300);
      continue;
    }

    String text = _k10MimoAsrParseText(response);
    audioBase64 = "";
    if (text.length() == 0) return "未识别到文本";
    return text;
  }

  audioBase64 = "";
  return lastError;
}`);

        Generator.addObject("k10_mimo_asr_begin_fn", "void", `_k10MimoAsrBegin(String apiKey, String voice) {
  Wire.begin(48, 47);
  _k10MimoAsrInitES7243E();

  _k10MimoAsrApiKey = apiKey;
  _k10MimoAsrModel = "mimo-v2.5-asr";
  _k10MimoTtsModel = "mimo-v2.5-tts";
  _k10MimoTtsVoice = voice;
  if (_k10MimoTtsVoice.length() == 0) _k10MimoTtsVoice = "冰糖";
  _k10MimoAsrMaxSeconds = 5;

  _k10MimoAsrInited = true;
}`);

        Generator.addObject("k10_mimo_asr_start_fn", "bool", `_k10MimoAsrStartRecording() {
  if (!_k10MimoAsrInited || _k10MimoAsrRecording || _k10MimoAsrTaskRunning) return false;

  if (_k10MimoAsrPcmBuffer) {
    free(_k10MimoAsrPcmBuffer);
    _k10MimoAsrPcmBuffer = NULL;
  }

  uint32_t maxBytes = (uint32_t)_k10MimoAsrMaxSeconds * _k10MimoAsrSampleRate * 2;
  _k10MimoAsrPcmBuffer = (uint8_t *)ps_malloc(maxBytes);
  if (!_k10MimoAsrPcmBuffer) return false;

  _k10MimoAsrPcmBytes = 0;
  _k10MimoAsrRecording = true;

  BaseType_t ok = xTaskCreatePinnedToCore(
    _k10MimoAsrRecordTask,
    "k10_asr_rec",
    4096,
    NULL,
    1,
    &_k10MimoAsrTaskHandle,
    1
  );

  if (ok != pdPASS) {
    _k10MimoAsrRecording = false;
    free(_k10MimoAsrPcmBuffer);
    _k10MimoAsrPcmBuffer = NULL;
    return false;
  }

  return true;
}`);

        Generator.addObject("k10_mimo_asr_stop_fn", "String", `_k10MimoAsrStopAndRecognize() {
  if (!_k10MimoAsrInited) return "未初始化";
  if (!_k10MimoAsrPcmBuffer) return "未开始录音";

  _k10MimoAsrRecording = false;

  unsigned long waitStart = millis();
  while (_k10MimoAsrTaskRunning && millis() - waitStart < 3000) {
    delay(20);
    yield();
  }

  if (_k10MimoAsrPcmBytes < 1000) {
    free(_k10MimoAsrPcmBuffer);
    _k10MimoAsrPcmBuffer = NULL;
    return "录音太短";
  }

  uint32_t wavBytes = _k10MimoAsrPcmBytes + 44;
  uint8_t *wavBuffer = (uint8_t *)ps_malloc(wavBytes);
  if (!wavBuffer) {
    free(_k10MimoAsrPcmBuffer);
    _k10MimoAsrPcmBuffer = NULL;
    return "WAV内存不足";
  }

  _k10MimoAsrWriteWavHeader(wavBuffer, _k10MimoAsrPcmBytes);
  memcpy(wavBuffer + 44, _k10MimoAsrPcmBuffer, _k10MimoAsrPcmBytes);
  free(_k10MimoAsrPcmBuffer);
  _k10MimoAsrPcmBuffer = NULL;

  String result = _k10MimoAsrSendWav(wavBuffer, wavBytes);
  free(wavBuffer);
  return result;
}`);
    }

    //% block="初始化MiMo API密钥[API_KEY] 音色[VOICE]" blockType="command"
    //% API_KEY.shadow="string" API_KEY.defl="api_key"
    //% VOICE.shadow="string" VOICE.defl="冰糖"
    export function init(parameter: any, block: any) {
        addRuntime();
        const apiKey = parameter.API_KEY.code;
        const voice = parameter.VOICE.code;
        Generator.addCode(`_k10MimoAsrBegin(${apiKey}, ${voice});`);
    }

    //% block="开始录音" blockType="command"
    export function startRecording(parameter: any, block: any) {
        addRuntime();
        Generator.addCode(`_k10MimoAsrStartRecording();`);
    }

    //% block="结束录音并返回识别结果" blockType="reporter"
    export function stopAndRecognize(parameter: any, block: any) {
        addRuntime();
        Generator.addCode(`_k10MimoAsrStopAndRecognize()`);
    }

    //% block="MiMo合成语音 文本[TEXT] 风格[STYLE]" blockType="command"
    //% TEXT.shadow="string" TEXT.defl="你好，这是语音合成。"
    // Mind+ 对空字符串 shadow 会自动填入 hello；用单空格显示为空，运行时会 trim 成空风格。
    //% STYLE.shadow="string" STYLE.defl=" "
    export function synthesize(parameter: any, block: any) {
        addRuntime();
        const text = parameter.TEXT.code;
        const style = parameter.STYLE.code;
        Generator.addCode(`_k10MimoTtsSpeak(${text}, ${style});`);
    }
}
