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

        /**
         * Returns the deck, if available, from the given channel. This takes the deck moving feature in account.
         * Set canChangePosition accordingly to how many controls are given on the controller: There are two jog wheels,
         * for 4 decks. But there are 4 load buttons, which don't have to be remapped if a deck changes its side/position.
         *
         * @param canChangePosition Defaults to true; set to true for jog wheels, play button and such; set to false for the load button or EQ etc.
         */
        fromChannel: function (channel, canChangePosition) {
            canChangePosition = _.defaultTo(canChangePosition, true);

            if (canChangePosition) {
                var deckNumber = _(Beatmixxxx.decks.sides.getAll())
                    .filter(function (side) {
                        return _.includes(side.channels, channel);
                    })
                    .map("deck")
                    .first();
                return Beatmixxxx.decks[deckNumber];
            } else {
                return Beatmixxxx.decks[channel];
            }
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
            this.softTakeover.setup();

            this.registerListener({
                name: "shift",
                onBinaryInput: function (deck, down) {
                    Beatmixxxx.shifted = down;
                },
                onDown: function () {
                    Beatmixxxx.midiInput.softTakeover.disableAll();
                },
                onUp: function () {
                    Beatmixxxx.midiInput.softTakeover.enableIfHasChangedOrWasEnabled();
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
                name: "traxRotate",
                onInputNonShifted: function (value) {
                    var speed = value - Beatmixxxx.midiInput.values.ENCODER_OFFSET;
                    engine.setValue("[Library]", "MoveVertical", speed);
                }
            });

            this.registerListener({
                name: "traxPress",
                onDownNonShifted: function () {
                    // there seem to be only 2 states anyway
                    engine.setValue("[Library]", "MoveFocus", 1);

                    // wiggle the knob to make Mixxx show the blue selection marker
                    engine.setValue("[Library]", "MoveVertical", 1);
                    engine.setValue("[Library]", "MoveVertical", -1);
                },
                onDownShifted: function () {
                    // there's just an "open folder" feature in this mapping, no "close" yet
                    engine.setValue("[Library]", "MoveRight", true)
                }
            });

            this.registerListener({
                name: "load",
                canChangePosition: false,
                onDownNonShifted: function (deck) {
                    deck.setValue("LoadSelectedTrack");
                }
            });

            this.registerListener({
                name: "crossfader",
                onInput: function (value) {
                    var position = script.absoluteLin(value, -1, 1, 0x00, 0x7F);
                    Beatmixxxx.midiInput.softTakeover.receivedNewValue(position, "[Master]", "crossfader");
                }
            });

            this.registerListener({
                name: "leftDeckSwitch",
                noDeck: true,
                onDownNonShifted: function () {
                    script.toggleControl("[Master]", "maximize_library");
                }
            })
        },

        registerListener: function (listener) {
            this[("control" + _.upperFirst(listener.name))] = function (channel, control, value, status, _group) {

                if (!listener.noDeck) {
                    // this deck variable is actually declared and accessible outside of the "if" because JavaScript
                    var deck = Beatmixxxx.decks.fromChannel(channel, listener.canChangePosition);
                }
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

                if (!_.isUndefined(deck) && !_.isUndefined(listener.buttonLed)) {
                    if (down) {
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
        },

        softTakeover: {
            setup: function () {
                this.forEachEntry(function (group, parameter) {
                    engine.makeConnection(group, parameter, Beatmixxxx.midiInput.softTakeover.checkForExternalChanges);
                });
            },

            checkForExternalChanges: function (externalValue, group, parameter) {
                var entry = Beatmixxxx.midiInput.softTakeover.list[group][parameter];

                entry.enabled = entry.value !== externalValue; // catch the external changes by activating SoftTakeover
                engine.softTakeover(group, parameter, entry.enabled);
            },

            disableAll: function () {
                this.forEachEntry(function (group, parameter) {
                    engine.softTakeover(group, parameter, false);
                });
            },

            enableIfHasChangedOrWasEnabled: function () {
                this.forEachEntry(function (group, parameter, entry) {
                    if (entry.hasChanged || entry.enabled) {
                        engine.softTakeover(group, parameter, true);
                        entry.enabled = true;
                        entry.hasChanged = false;
                    }
                });
            },

            receivedNewValue: function (value, group, parameter) {
                var entry = Beatmixxxx.midiInput.softTakeover.list[group][parameter];
                if (!Beatmixxxx.shifted) {
                    entry.value = value;
                    engine.setValue(group, parameter, value);
                }
                entry.hasChanged = entry.value !== value;
            },

            forEachEntry: function (func) {
                _.forEach(this.list, function (entries, group) {
                    _.forEach(entries, function (entry, parameter) {
                        func(group, parameter, entry);
                    });
                });
            },

            list: _({
                "[Master]": {
                    "crossfader": {}
                }
            }).mapValues(function (entries) {
                return _.mapValues(entries, function () {
                    return {
                        enabled: false,
                        hasChanged: false,
                        value: 0.0
                    };
                })
            }).value()
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