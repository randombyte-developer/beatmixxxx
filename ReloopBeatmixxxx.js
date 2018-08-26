var Beatmixxxx = {
    shifted: false,
    decks: {
        setup: function () {
            _.times(4, function (i) { Beatmixxxx.decks.newDeck(i + 1).setup(); });
        },

        // which deck is on which side, one deck can be on both side at the same time
        sides: {
            left: {
                channels: [1, 3],
                deck: 1
            },
            right: {
                channels: [2, 4],
                deck: 2
            },
            getAll: function () {
                return [this.left, this.right];
            }
        },

        newDeck: function (number) {
            return this[number] = {
                number: number,
                group: "[Channel" + number + "]",

                makeConnection: function (control, callback) {
                    engine.makeConnection(this.group, control, callback).trigger();
                },

                isPlaying: function () {
                    return engine.getValue(this.group, "play");
                },

                isBraking: function () {
                    // TODO
                },

                getChannels: function () {
                    return _(Beatmixxxx.decks.sides.getAll())
                        .filter({ deck: this.number })
                        .flatMap("channels")
                        .value();
                },

                setup: function () {
                }
            };
        },

        fromGroup: function (group) {
            return this[_.parseInt(group.substring(8, 9))];
        }
    },
    midiInput: {
        values: {
            DOWN: 0x7F,
            UP: 0x00
        },

        setup: function () {
            this.registerListener({
                name: "shift",
                onBinaryInput: function (deck, down) {
                    // regardless of which shift button was pressed, both send their "on" signals
                    // we only want to catch one of them, from the left side here (deck 1 or 3)
                    if (deck.number === 1 || deck.number === 3) {
                        Beatmixxxx.shifted = down;
                    }
                }
            });

            this.registerSimpleButton("sync", "beatsync");

            this.registerListener({
                name: "cue",
                onDown: function () {

                }
            });

            this.registerListener({
                name: "play",
                onDownNonShifted: function (deck) {
                    script.toggleControl(deck.group, "play");
                },
                onDownShifted: function (deck) {
                    if (deck.isPlaying()) {
                        engine.brake(deck.number, true);
                    } else {
                        engine.softStart(deck.number, true);
                    }
                }
            });
        },

        registerSimpleButton: function (buttonName, controlName) {
            this.registerListener({
                name: buttonName,
                onDown: function (deck) {
                    engine.setValue(deck.group, controlName, true);
                },
                onInput: function (deck, control, value) {
                    Beatmixxxx.leds.set(deck, control, value)
                }
            });
        },

        registerListener: function (listener) {
            this[("control" + _.upperFirst(listener.name))] = function (channel, control, value, status, group) {
                var deck = Beatmixxxx.decks.fromGroup(group);
                var down = (value === Beatmixxxx.midiInput.values.DOWN);

                _.forEach([
                    _.defaultTo(listener.onInput, _.noop),
                    Beatmixxxx.shifted ? _.defaultTo(listener.onInputShifted, _.noop) : _.noop,
                    !Beatmixxxx.shifted ? _.defaultTo(listener.onInputNonShifted, _.noop) : _.noop,

                    _.defaultTo(listener[down ? "onDown" : "onUp"], _.noop),
                    Beatmixxxx.shifted ? _.defaultTo(listener[down ? "onDownShifted" : "onUpShifted"], _.noop) : _.noop,
                    !Beatmixxxx.shifted ? _.defaultTo(listener[down ? "onDownNonShifted" : "onUpNonShifted"], _.noop) : _.noop
                ], function (func) {
                    func(deck, control, value, status);
                });

                // parameter order changed here, value/down is second
                _.defaultTo(listener.onBinaryInput, _.noop)(deck, down, channel, control, status);
            }
        }
    },

    leds: {
        values: {
            ON: 0x7F,
            OFF: 0x00
        },

        set: function (deck, control, status) {
            _.forEach(deck.getChannels(), function (channel) {
                midi.sendShortMsg(0x90 + channel, control - 1, Beatmixxxx.leds.values[status ? "ON" : "OFF"]);
            });
        }
    },

    init: function () {
        print("Hello there!");
    },

    shutdown: function () {

    }
};

Beatmixxxx.decks.setup();
Beatmixxxx.midiInput.setup();