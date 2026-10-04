"""Prepare licensed Freesound previews; source directory is supplied explicitly.
See docs/AUDIO_SOURCES.md for authors, licenses, URLs and processing details.
Python standard library only. Inputs: cue.wav, collision.wav, pocket.wav (PCM16).
"""
import array
import math
from pathlib import Path
import sys
import wave

source = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / 'web/assets/audio'
out.mkdir(parents=True, exist_ok=True)

def read(name):
    with wave.open(str(source / (name + '.wav'))) as f:
        assert f.getsampwidth() == 2
        rate, channels = f.getframerate(), f.getnchannels()
        raw = array.array('h', f.readframes(f.getnframes()))
        if sys.byteorder != 'little': raw.byteswap()
    return rate, [sum(raw[i:i + channels]) / (channels * 32768) for i in range(0, len(raw), channels)]

def write(name, rate, data, peak=.7, cutoff=None):
    mean = sum(data) / len(data)
    data = [x - mean for x in data]
    if cutoff:
        alpha = 1 - math.exp(-2 * math.pi * cutoff / rate)
        for _ in range(2):
            previous = 0
            for i, value in enumerate(data):
                previous += alpha * (value - previous)
                data[i] = previous
    # Short fades retain the transient while avoiding cut-boundary clicks.
    for i in range(len(data)):
        data[i] *= min(1, i / (rate * .0004), (len(data) - 1 - i) / (rate * .018))
    gain = peak / max(abs(x) for x in data)
    pcm = array.array('h', (round(x * gain * 32767) for x in data))
    if sys.byteorder != 'little': pcm.byteswap()
    with wave.open(str(out / (name + '.wav')), 'wb') as f:
        f.setparams((1, 2, rate, len(pcm), 'NONE', 'not compressed'))
        f.writeframes(pcm.tobytes())
    print(name, round(len(data) / rate, 3), 'seconds', len(pcm) * 2 + 44, 'bytes')

rate, cue = read('cue')
for index, start in enumerate([1.515, 3.025, 4.535]):
    clip = cue[int(start * rate):int((start + .43) * rate)]
    # Align each recorded contact to its first clear transient.
    onset = next(i for i, v in enumerate(clip) if abs(v) > .035)
    write('cue-' + str(index + 1), rate, clip[max(0, onset - int(.002 * rate)):], .65)
rate, hit = read('collision')
write('collision', rate, hit, .72)
# Designed cushion response from a real impact, not a dedicated cushion recording.
write('cushion', rate, hit[:int(rate * .16)], .42, 650)
rate, pocket = read('pocket')
write('pocket', rate, pocket, .62)
