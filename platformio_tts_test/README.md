# K10 MiMo TTS 测试程序

这是封装前的硬件验证工程，使用 PlatformIO 编译到 `unihiker_k10`。

1. 复制 `src/local_secrets.h.example` 为 `src/local_secrets.h`，填写 Wi-Fi 和 MiMo API Key。
2. 用 `~/.platformio/penv/bin/pio run -t upload` 上传。
3. 打开 115200 串口：按 A 测试非流式 WAV，按 B 测试流式 PCM16。

流式接口使用 24 kHz PCM16 单声道，程序收到分片后立即送到 K10 I2S0 播放；非流式接口接收完整 WAV 后播放。

`local_secrets.h` 只保存在本地，已加入忽略规则，不要提交密钥。
