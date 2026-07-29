//% color="#2563EB" iconWidth=45 iconHeight=45
namespace k10_mimo_asr {

    function addLibrary() {
        Generator.addInclude("include_K10MimoAudio_h", "#include <K10MimoAudio.h>");
    }

    //% block="初始化MiMo API密钥[API_KEY] 音色[VOICE]" blockType="command"
    //% API_KEY.shadow="string" API_KEY.defl="api_key"
    //% VOICE.shadow="string" VOICE.defl="冰糖"
    export function init(parameter: any, block: any) {
        addLibrary();
        const apiKey = parameter.API_KEY.code;
        const voice = parameter.VOICE.code;
        Generator.addCode(`k10MimoInit(${apiKey}, ${voice});`);
    }

    //% block="开始录音" blockType="command"
    export function startRecording(parameter: any, block: any) {
        addLibrary();
        Generator.addCode(`k10MimoStartRecording();`);
    }

    //% block="结束录音并返回识别结果" blockType="reporter"
    export function stopAndRecognize(parameter: any, block: any) {
        addLibrary();
        Generator.addCode(`k10MimoStopAndRecognize()`);
    }

    //% block="MiMo合成语音 文本[TEXT] 风格[STYLE]" blockType="command"
    //% TEXT.shadow="string" TEXT.defl="你好，这是语音合成。"
    // Mind+ 对空字符串 shadow 会自动填入 hello；用单空格显示为空，运行时会 trim 成空风格。
    //% STYLE.shadow="string" STYLE.defl=" "
    export function synthesize(parameter: any, block: any) {
        addLibrary();
        const text = parameter.TEXT.code;
        const style = parameter.STYLE.code;
        Generator.addCode(`k10MimoSpeak(${text}, ${style});`);
    }
}
