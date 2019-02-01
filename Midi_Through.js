var MT = {};

MT.sendMidi = function (signal, explicitValue) {

	signal -= 129; // that's where QLC's "midi internal channels" begin
	var simulateButtonPress = _.isUndefined(explicitValue);

	if (simulateButtonPress) {
		midi.sendShortMsg(0x90, signal, 127);
		engine.beginTimer(10, function() {
			midi.sendShortMsg(0x90, signal, 0);
		}, true); // one-shot timer to turn the "button-press" off
	} else {
		midi.sendShortMsg(0x90, signal, explicitValue);
	}
};

MT.currentDeck = 1;

MT.ch = function (deckNumber) {
	return "[Channel" + deckNumber + "]";
};

MT.scaleFromMidiValue = function (value) {
    return script.absoluteLin(value, 0x00, 0x7F, 0, 1);
}

MT.noMidi = {
	noMidi: true
};
MT.once = function (midi) {
	return {
		once: true,
		midi: midi
	};
};

// change color and moving in a certain interval
// the "color-set" is choosen somewhere else and is indicated by the color index in the fixture object
// the color changes in the given colorInterval
// if the moveIndex and moveInterval are given, then change the movement in the given interval too
MT.altColorAndMove = function (colorInterval, moveIndex, moveInterval) {
	return {
		colorInterval: colorInterval,
		moveIndex: moveIndex,
		moveInterval: moveInterval
	};
};

MT.altColor = function (colorInterval) {
	return MT.altColorAndMove(colorInterval);
};

MT.fixtures = [
	{
		name: "Pars",
		colors: [
			[132, 133], // Bunt
			[134, 135], // Warm
			[136, 137] // Kalt
		]
	},
	{
		name: "Led Bars",
		colors: [
			[150, 151], // Bunt
			[152, 153], // Warm
			[154, 155] // Kalt
		]
	},
	{
		name: "Quads",
		colors: [
			[138, 139], // Bunt
			[140, 141], // Warm
			[142, 143] // Kalt
		],
		moves: [
			[144, 145], // Chill
			[146, 147], // Normal
			[148, 149] // Speed
		]
	},
	{
		name: "Scanner",
		colors: [
			[156, 157], // Bunt
			[158, 159], // Warm
			[160, 161] // Kalt
		],
		moves: [
			[162, 163] // Punkte
		]
	}
];

// some presets to be used during live performance, which consist of the declared states above
// pars, led bars, quads -> that's the order from the MT.fixtures array
MT.presetStates = [
	MT.noMidi, // that's for all fixtures
	[MT.once(131), 		MT.altColor(16),	MT.altColorAndMove(8, 0, 16),	MT.altColorAndMove(16, 0, 8)],
	[MT.altColor(8), 	MT.altColor(8), 	MT.altColorAndMove(8, 0, 16), 	MT.altColorAndMove(8, 0, 8)],
	[MT.altColor(8), 	MT.altColor(8), 	MT.altColorAndMove(8, 1, 16), 	MT.altColorAndMove(8, 0, 8)],
	[MT.altColor(8), 	MT.altColor(8), 	MT.altColorAndMove(8, 1, 8), 	MT.altColorAndMove(4, 0, 4)],
	[MT.altColor(4), 	MT.altColor(8), 	MT.altColorAndMove(4, 1, 8),	MT.altColorAndMove(4, 0, 4)],
	[MT.altColor(4), 	MT.altColor(4), 	MT.altColorAndMove(4, 1, 4), 	MT.altColorAndMove(4, 0, 4)],
	[MT.altColor(2), 	MT.altColor(4), 	MT.altColorAndMove(4, 1, 4), 	MT.altColorAndMove(4, 0, 2)],
	[MT.altColor(2), 	MT.altColor(2), 	MT.altColorAndMove(2, 2, 4), 	MT.altColorAndMove(2, 0, 2)],
	[MT.altColor(1), 	MT.altColor(2), 	MT.altColorAndMove(2, 2, 4), 	MT.altColorAndMove(2, 0, 2)],
	[MT.altColor(1), 	MT.altColor(1), 	MT.altColorAndMove(1, 2, 2), 	MT.altColorAndMove(2, 0, 1)]
];

MT.currentPresetState = 1;
MT.presetStateBeforeStrobe = 3;
MT.currentColor = 0;
MT.onceSent = false; // if the midi was already sent when activated; this is reset when the preset is changed
MT.blackout = false; // tracks the in-QLC+ value if blackout is activated, sadly it can't be set to a "flash button"
MT.strobe = { slow: false, fast: false };

MT.shouldSendMidi = function (interval) {
	return (MT.beat % interval) == 0;
}

// returns 0 or 1 in this pattern for a 4/4 beat: 1---0---1---0---1---0---
MT.getAlternating = function (interval) {
	return (((MT.beat / interval) % 2) == 0) ? 1 : 0;
};

MT.beat = 1;
MT.onBeat = function () {
	MT.beat = (MT.beat + 1) % 64; // wrap around after 64 beats

	var presetState = MT.presetStates[MT.currentPresetState];

	if (presetState == MT.noMidi) {
		// nothing
		return
	}

	_.forEach(MT.fixtures, function (fixture, key) {
		var state = presetState[key];

		if (state.once && !MT.onceSent) {
			MT.sendMidi(state.midi);
		} else {
			if (MT.shouldSendMidi(state.colorInterval)) {
				var colors = fixture.colors[MT.currentColor];
				var alternatingIndex = MT.getAlternating(state.colorInterval)
				var midiColor = colors[alternatingIndex];
				MT.sendMidi(midiColor);
			}
			if (!_.isUndefined(state.moveIndex) && MT.shouldSendMidi(state.moveInterval)) {
				var moves = fixture.moves[state.moveIndex];
				var alternatingIndex = MT.getAlternating(state.moveInterval)
				var midiMove = moves[alternatingIndex];
				MT.sendMidi(midiMove);
			}
		}
	});

	// after a preset change, onceSent is set to false
	// the next beat will definitly trigger all midi signals because the beat was reset
	// so after those midi signals were sent, we can set onceSent to false
	MT.onceSent = true;
};

MT.movePresetStateIndex = function (direction) {
	MT.currentPresetState = _.clamp(MT.currentPresetState + direction, 0, MT.presetStates.length - 1);
	MT.beat = -1; // reset beat counter, the next beat is the first (MT.beat = 0), which triggers all midi signals
	MT.onceSent = false;
};

MT.resetSamplerVolume = function (samplerNum) {
	engine.setValue("[Sampler" + samplerNum + "]", "volume", 0); // reset the value ourselves to indicate that we read it
}

MT.init = function () {
	print("Hello there from the Through port!");

	MT.resetSamplerVolume(1);
	MT.resetSamplerVolume(2);

	// previous preset
	engine.makeConnection("[Sampler1]", "volume", function (pressed) {
		if (pressed != 1) {
			return;
		}
		MT.movePresetStateIndex(-1);
		MT.resetSamplerVolume(1);
	});

	// next preset
	engine.makeConnection("[Sampler2]", "volume", function (pressed) {
		if (pressed != 1) {
			return;
		}
		MT.movePresetStateIndex(+1);
		MT.resetSamplerVolume(2);
	});

	// stobe slow
	engine.makeConnection("[Sampler3]", "volume", function (pressedNum) {
		var pressed = (pressedNum == 1 ? true : false);

		// we have to track the in-QLC+ status of the strobe, because it can't be a flash scene
		if (MT.strobe.slow != pressed) {
			if (pressed) {
				MT.presetStateBeforeStrobe = MT.currentPresetState;
				MT.currentPresetState = 0;
			} else {
				MT.currentPresetState = MT.presetStateBeforeStrobe;
			}
			MT.sendMidi(164);
			print("Slow active: " + pressed);
			MT.strobe.slow = pressed;
		}
	});

	// strobe fast
	engine.makeConnection("[Sampler4]", "volume", function (pressedNum) {
		var pressed = (pressedNum == 1 ? true : false);

		if (MT.strobe.fast != pressed) {
			if (pressed) {
				MT.presetStateBeforeStrobe = MT.currentPresetState;
				MT.currentPresetState = 0;
			} else {
				MT.currentPresetState = MT.presetStateBeforeStrobe;
			}
			MT.sendMidi(165);
			print("Fast active: " + pressed);
			MT.strobe.fast = pressed;
		}
	});

	// light intensity & blackout
	engine.makeConnection("[Sampler5]", "volume", function (value) {
		var faderDown = (value == 0);

		if (faderDown != MT.blackout) {
			MT.sendMidi(166);
				MT.blackout = faderDown;
		}
		if (!faderDown) {
			MT.sendMidi(167, MT.scaleFromMidiValue(value));
		}
	});

	// figure out which deck is giving the beat
	engine.makeConnection("[Master]", "crossfader", function (crossfader) {
		var baseDeck = crossfader < 0 ? 1 : 2;

		var vol1 = engine.getParameter(MT.ch(baseDeck), "volume");
		var vol2 = engine.getParameter(MT.ch(baseDeck + 2), "volume");

		MT.currentDeck = baseDeck + (vol1 > vol2 ? 0 : 2);
	});

	// connect to each of the four deck's beat, but only actually use it when the deck is the active/main one
	_.times(4, function (deck) {
		deck += 1; // because 0/1-indexed
		engine.makeConnection(MT.ch(deck), "beat_active", function(value) {
			if (value == 1 && deck == MT.currentDeck) {
				MT.onBeat();
			}
		});
	});
};