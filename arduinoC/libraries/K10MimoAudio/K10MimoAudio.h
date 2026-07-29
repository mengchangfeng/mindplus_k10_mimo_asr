#ifndef K10_MIMO_AUDIO_H
#define K10_MIMO_AUDIO_H

#include <Arduino.h>

void k10MimoInit(const String &apiKey, const String &voice);
bool k10MimoStartRecording();
String k10MimoStopAndRecognize();
String k10MimoSpeak(const String &text, const String &style);

#include "K10MimoAudio.inl"

#endif
