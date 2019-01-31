var MT = {};

MT.sendMidi = function (signal) {
	midi.sendShortMsg(0x90, signal, 127);
	engine.beginTimer(100, function() {
		midi.sendShortMsg(0x90, signal, 0);
		print(signal + 129);
	}, true); // one-shot timer to turn the "button-press" off
};

MT.currentDeck = 1;

MT.ch = function (deckNumber) {
	return "[Channel" + deckNumber + "]";
};

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
		states: [
			MT.noMidi,
			MT.once(1), // Aus, QLC channel 130
			MT.once(2), // Fade
			MT.altColor(16),
			MT.altColor(8),
			MT.altColor(4),
			MT.altColor(2),
			MT.altColor(1),
		],
		state: 3,
		onceSent: false, // if the midi was already sent in the 'once' mode
		colors: [
			[3, 4], // Bunt
			[5, 6], // Warm
			[7, 8] // Kalt
		],
		color: 0
	},
	{
		name: "Quads",
		states: [
			MT.noMidi,
			MT.once(21), // Aus, beide Aus-Buttons auf Midi 21
			MT.altColorAndMove(8, 0, 16),
			MT.altColorAndMove(4, 0, 16),
			MT.altColorAndMove(8, 1, 8),
			MT.altColorAndMove(4, 1, 8),
			MT.altColorAndMove(1, 1, 8),
			MT.altColorAndMove(4, 1, 4),
			MT.altColorAndMove(2, 1, 4),
			MT.altColorAndMove(4, 2, 8),
			MT.altColorAndMove(2, 2, 8),
			MT.altColorAndMove(4, 2, 4),
			MT.altColorAndMove(2, 2, 4),
			MT.altColorAndMove(1, 2, 4)
		],
		state: 3,
		onceSent: false, // if the midi was already sent in the 'once' mode
		colors: [
			[9, 10], // Bunt, 138, 139
			[11, 12], // Warm 140, 141
			[13, 14] // Kalt 142, 143
		],
		color: 0,
		moves: [
			[15, 16], // Chill, 144, 145
			[17, 18], // Normal 146, 147
			[19, 20] // Speed 148, 149
		]
	}
];

MT.currentFixture = 0;

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
	_.forEach(MT.fixtures, function (fixture) {
		var state = fixture.states[fixture.state];
		if (state == MT.noMidi) {
			// no midi
		} else if (state.once && !fixture.onceSent) {
			MT.sendMidi(state.midi);
			fixture.onceSent = true;
		} else {
			if (MT.shouldSendMidi(state.colorInterval)) {
				var colors = fixture.colors[fixture.color];
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
};

MT.init = function () {
	print("Hello there from the through port!");

	// change fixture selection
	engine.makeConnection("[Sampler1]", "volume", function (direction) {
		if (direction == 0.5) {
			return;
		}

		MT.currentFixture = _.clamp(MT.currentFixture + (direction > 0 ? 1 : -1), 0, MT.fixtures.length - 1);

		engine.setValue("[Sampler1]", "volume", 0.5); // force throwing an event when the value is set to 0 or 1 in the other script
	});

	// change fixture state
	engine.makeConnection("[Sampler2]", "volume", function (direction) {
		if (direction == 0.5) {
			return;
		}

		var fixture = MT.fixtures[MT.currentFixture];
		fixture.state = _.clamp(fixture.state + (direction > 0 ? 1 : -1), 0, fixture.states.length - 1);
		fixture.onceSent = false;
		MT.beat = -1;

		engine.setValue("[Sampler2]", "volume", 0.5);
	});

	engine.makeConnection("[Master]", "crossfader", function (crossfader) {
		var baseDeck = crossfader < 0 ? 1 : 2;

		var vol1 = engine.getParameter(MT.ch(baseDeck), "volume");
		var vol2 = engine.getParameter(MT.ch(baseDeck + 2), "volume");

		MT.currentDeck = baseDeck + (vol1 > vol2 ? 0 : 2);
		print(MT.currentDeck);
	});

	_.times(4, function (deck) {
		deck += 1;
		engine.makeConnection(MT.ch(deck), "beat_active", function(value) {
			if (value == 1 && deck == MT.currentDeck) {
				MT.onBeat();
			}
		});
	});
};