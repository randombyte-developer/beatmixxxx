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
		off: 130,
		colors: [
			[132, 133], // Bunt
			[134, 135], // Warm
			[136, 137] // Kalt
		]
	},
	{
		name: "Led Bars",
		off: 168,
		colors: [
			[150, 151], // Bunt
			[152, 153], // Warm
			[154, 155] // Kalt
		]
	},
	{
		name: "Quads",
		off: 169,
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
		off: 170,
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
// pars, led bars, quads, scanner -> that's the order from the MT.fixtures array
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

// pars, led bars, quads, scanner
MT.fixtureFilters = [
	[1, 0, 0, 0],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
	[0, 0, 0, 1],
	[1, 1, 0, 0],
	[0, 1, 1, 0],
	[0, 1, 0, 1],
	[1, 1, 0, 1],
	[1, 1, 1, 1]
];

MT.currentPresetState = 1;
MT.presetStateBeforeStrobe = 3;
MT.currentFixtureFilter = MT.fixtureFilters.length - 1;
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

MT.forceMidiSendOnNextBeat = function () {
	MT.beat = -1;
	MT.onceSent = false;
};

MT.beat = 1;
MT.onBeat = function () {
	MT.beat = (MT.beat + 1) % 64; // wrap around after 64 beats

	var presetState = MT.presetStates[MT.currentPresetState];
	var filters = MT.fixtureFilters[MT.currentFixtureFilter];

	if (presetState == MT.noMidi) {
		// nothing
		return
	}

	_.forEach(MT.fixtures, function (fixture, key) {
		var filter = filters[key];
		if (filter == 0) { // I don't trust these JS truthy values lol
			if (!MT.onceSent) {
				MT.sendMidi(fixture.off);
			}

			return true; // continue
		}

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
	MT.forceMidiSendOnNextBeat(); // reset beat counter, the next beat is the first (MT.beat = 0), which triggers all midi signals
};

MT.moveFixtureFilterIndex = function (direction) {
	MT.currentFixtureFilter = _.clamp(MT.currentFixtureFilter + direction, 0, MT.fixtureFilters.length - 1);
	MT.forceMidiSendOnNextBeat();
};

MT.resetSamplerVolume = function (samplerNum) {
	engine.setValue("[Sampler" + samplerNum + "]", "volume", 0); // reset the value ourselves to indicate that we read it
}

MT.init = function () {
	print("Hello there from the Through port!");

	_.times(9, function (i) {
		MT.resetSamplerVolume(i + 1);
	});

	// previous & next preset
	_.forEach({ 1: -1, 2: +1 }, function (direction, samplerNum) {
		engine.makeConnection("[Sampler" + samplerNum + "]", "volume", function (pressed) {
			if (pressed != 1) {
				return;
			}
			MT.movePresetStateIndex(direction);
			MT.resetSamplerVolume(samplerNum);
		});
	});

	// previous & next fixture filter
	_.forEach({ 6: -1, 7: +1 }, function (direction, samplerNum) {
		engine.makeConnection("[Sampler" + samplerNum + "]", "volume", function (pressed) {
			if (pressed != 1) {
				return;
			}

			MT.moveFixtureFilterIndex(direction);
			MT.resetSamplerVolume(samplerNum);
		});
	});

	// strobe slow
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
			MT.strobe.slow = pressed;
			MT.forceMidiSendOnNextBeat();
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
			MT.strobe.fast = pressed;
			MT.forceMidiSendOnNextBeat();
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

	// strict scene control & automatic scene advancing
	_.forEach({ 8: 171, 9: 172 }, function (midi, samplerNum) {
		engine.makeConnection("[Sampler" + samplerNum + "]", "volume", function (pressed) {
			if (pressed != 1) {
				return;
			}

			MT.sendMidi(midi, 127); // weird QLC+ thing that it can't be a normal button press, but has to stay at the DMX-high level
			MT.resetSamplerVolume(samplerNum);
		});
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