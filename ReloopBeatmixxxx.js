var Beatmixxxx = {
    shifted: false,
    decks: {
        setup: function () {
            _.times(4, function (i) { Beatmixxxx.decks.newDeck(i + 1).setup(); });
        },

        // which deck is on which side, one deck can be on both sides at the same time
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

        fromGroup: function (group) {
            return this[group.substring(8, 9)];
        },

        fromChannel: function (channel) {
            var deckNumber = _(Beatmixxxx.decks.sides.getAll())
                .filter(function (side) {
                    return _.includes(side.channels, channel);
                })
                .map("deck")
                .first();
            return Beatmixxxx.decks[deckNumber];
        },

        newDeck: function (number) {
            return this[number] = {
                number: number,
                group: "[Channel" + number + "]",

                makeConnection: function (control, callback) {
                    engine.makeConnection(this.group, control, callback).trigger();
                },

                setValue: function (parameter, value) {
                    if (_.isUndefined(value)) {
                        value = true;
                    }
                    engine.setValue(this.group, parameter, value);
                },

                getValue: function (parameter) {
                    return engine.getValue(this.group, parameter);
                },

                toggleValue: function (parameter) {
                    var newValue = !this.getValue(parameter);
                    this.setValue(parameter, newValue);
                    return newValue;
                },

                setLed: function (control, status) {
                    _.forEach(this.getChannels(), function (channel) {
                        Beatmixxxx.leds.set(channel, control, status);
                    });
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
        }
    },
    midiInput: {
        values: {
            DOWN: 0x7F,
            UP: 0x00,
            ENCODER_OFFSET: 0x40
        },

        setup: function () {
            this.registerListener({
                name: "shift",
                onBinaryInput: function (deck, down) {
                    Beatmixxxx.shifted = down;
                }
            });

            this.registerListener({
                name: "sync",
                buttonLed: "nonShifted",
                onDownNonShifted: function (deck) {
                    deck.setValue("beatsync");
                }
            });

            this.registerListener({
                name: "cue",
                buttonLed: "shifted",
                onDownShifted: function (deck) {
                    deck.setValue("start");
                }
            });

            this.registerListener({
                name: "play",
                buttonLed: "both",
                onDownNonShifted: function (deck) {
                    deck.toggleValue("play");
                },
                onDownShifted: function (deck) {
                    if (deck.getValue("play")) {
                        engine.brake(deck.number, true);
                    } else {
                        engine.softStart(deck.number, true);
                    }
                }
            });

            this.registerListener({
                name: "trax",
                onInput: function (value) {
                    var speed = value - Beatmixxxx.midiInput.values.ENCODER_OFFSET;
                    engine.setValue("[Library]", "MoveVertical", speed);
                }
            })
        },

        registerListener: function (listener) {
            this[("control" + _.upperFirst(listener.name))] = function (channel, control, value, status, _group) {
                var deck = Beatmixxxx.decks.fromChannel(channel);
                var down = (value === Beatmixxxx.midiInput.values.DOWN);

                _([
                    listener.onInput,
                    Beatmixxxx.shifted ? listener.onInputShifted : _.noop,
                    !Beatmixxxx.shifted ? listener.onInputNonShifted : _.noop,

                    listener[down ? "onDown" : "onUp"],
                    Beatmixxxx.shifted ? listener[down ? "onDownShifted" : "onUpShifted"] : _.noop,
                    !Beatmixxxx.shifted ? listener[down ? "onDownNonShifted" : "onUpNonShifted"] : _.noop
                ])
                    .filter(_.negate(_.isUndefined))
                    .forEach(function (func) {
                        if (_.isUndefined(deck)) {
                            func(value, control, status);
                        } else {
                            func(deck, value, control, status);
                        }
                    });

                if (_.isUndefined(deck)) {
                    _.defaultTo(listener.onBinaryInput, _.noop)(down, control, status);
                } else {
                    _.defaultTo(listener.onBinaryInput, _.noop)(deck, down, control, status);
                }

                if (!_.isUndefined(deck)) {
                    if (down) {
                        // don't merge these 'if's to prevent custom behavior from being overwritten
                        if (
                            listener.buttonLed === "both" ||
                            listener.buttonLed === "shifted" && Beatmixxxx.shifted ||
                            listener.buttonLed === "nonShifted" && !Beatmixxxx.shifted
                        ) {
                            deck.setLed(control, true);
                        }
                    } else {
                        deck.setLed(control, false);
                    }
                }
            }
        }
    },

    leds: {
        values: {
            ON: 0x7F,
            OFF: 0x00
        },

        set: function (channel, control, status) {
            midi.sendShortMsg(0x90 + channel, control - 1, Beatmixxxx.leds.values[status ? "ON" : "OFF"]);
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