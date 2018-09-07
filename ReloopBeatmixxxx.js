var Beatmixxxx = {
    state: {
        global: {
            shifted: false
        },
        side: {
            fromChannel: function (channel) {
                var sideName = Beatmixxxx.decks.sides.fromChannel(channel).name;
                var sideState = Beatmixxxx.state.side[sideName];

                return sideState;
            },

            setup: function () {
                defaultSideState = {
                    modeA: true,
                    modeB: false,

                    setA: function () {
                        this.modeA = true;
                        this.modeB = false;
                    },
                    setB: function () {
                        this.modeB = true;
                        this.modeA = false;
                    },
                    setAB: function () {
                        this.modeA = true;
                        this.modeB = true;
                    },

                    isA: function () {
                        return this.modeA === true && this.modeB === false;
                    },
                    isB: function () {
                        return this.modeB === true && this.modeA === false;
                    },
                    isAB: function () {
                        return this.modeA === true && this.modeB === true;
                    }
                };

                this.left = _.clone(defaultSideState);
                this.right = _.clone(defaultSideState);
            }
        }
    },

    decks: {
        setup: function () {
            _.times(4, function (i) { Beatmixxxx.decks.newDeck(i + 1).setup(); });
        },

        getAll: function() {
            return _.times(4, function (i) { return Beatmixxxx.decks[i + 1] });
        },

        // which deck is on which side, one deck can be on both sides at the same time
        sides: {
            left: {
                name: "left",
                channels: [1, 3],
                deck: 1
            },
            right: {
                name: "right",
                channels: [2, 4],
                deck: 2
            },

            getAll: function () {
                return [this.left, this.right];
            },

            fromChannel: function (channel) {
                return _(Beatmixxxx.decks.sides.getAll())
                    .filter(function (side) {
                        return _.includes(side.channels, channel);
                    }).first();
            },

            modifierPressed: function (modifier, ledMidiNumber, channel) {
                var side = Beatmixxxx.decks.sides.fromChannel(channel);
                side.deck = ((side.deck - 1) ^ modifier) + 1;

                _.forEach(side.channels, function (ch) {
                    Beatmixxxx.leds.set(ch, ledMidiNumber, (side.deck - 1) & modifier, 0x40);
                });

                Beatmixxxx.midiInput.softTakeover.onDeckChanged();
                Beatmixxxx.decks.fromChannel(channel).triggerConnections();
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
                var deckNumber = Beatmixxxx.decks.sides.fromChannel(channel).deck;
                return Beatmixxxx.decks[deckNumber];
            } else {
                return Beatmixxxx.decks[channel];
            }
        },

        newDeck: function (number) {
            return this[number] = {
                number: number,
                group: "[Channel" + number + "]",

                connections: [],

                setup: function () {
                    var deck = this;

                    this.makeConnection("pfl", function (value) {
                        Beatmixxxx.leds.set(deck.number, 0x52, value, 0x20);
                    });

                    deck.connections = _.concat(deck.connections, _.map(_.range(4), function (padIndex) {
                        return deck.makeConnection("hotcue_" + (padIndex + 1) + "_enabled", function (value) {
                            deck.setLed(padIndex, value, 0x40);
                        });
                    }));
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

                makeConnection: function (control, callback) {
                    return engine.makeConnection(this.group, control, callback);
                },

                triggerConnections: function () {
                    _.forEach(this.connections, function (connection) {
                        connection.trigger();
                    })
                },

                setLed: function (control, status, shiftOffset) {
                    _.forEach(this.getChannels(), function (channel) {
                        Beatmixxxx.leds.set(channel, control, status, shiftOffset);
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
                noDeck: true,
                onBinaryInput: function (down) {
                    Beatmixxxx.state.global.shifted = down;
                }
            });

            this.registerListener({
                name: "sync",
                led: {
                    midiNumber: 0x20,
                    behavior: "nonShifted",
                    shiftOffset: 0x40
                },
                onDownNonShifted: function (deck) {
                    deck.setValue("beatsync");
                }
            });

            this.registerListener({
                name: "cue",
                led: {
                    midiNumber: 0x22,
                    behavior: "shifted",
                    shiftOffset: 0x40
                },
                onDownShifted: function (deck) {
                    deck.setValue("start");
                }
            });

            this.registerListener({
                name: "play",
                led: {
                    midiNumber: 0x23,
                    behavior: "both",
                    shiftOffset: 0x40
                },
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
                noDeck: true,
                onInputNonShifted: function (value) {
                    var speed = value - Beatmixxxx.midiInput.values.ENCODER_OFFSET;
                    engine.setValue("[Library]", "MoveVertical", speed);
                }
            });

            this.registerListener({
                name: "traxPress",
                noDeck: true,
                onDownNonShifted: function () {
                    // there seem to be only 2 states anyway
                    engine.setValue("[Library]", "MoveFocus", 1);
                },
                onDownShifted: function () {
                    // there's just an "open folder" feature in this mapping, no "close" yet
                    engine.setValue("[Library]", "MoveRight", true)
                }
            });

            this.registerListener({
                name: "load",
                canChangePosition: false,
                led: {
                    midiNumber: 0x50,
                    behavior: "nonShifted"
                },
                onDownNonShifted: function (deck) {
                    deck.setValue("LoadSelectedTrack");
                }
            });

            this.registerListener({
                name: "crossfader",
                noDeck: true,
                onInput: function (value) {
                    Beatmixxxx.midiInput.softTakeover.midiInput("[Master]", "crossfader", value, !Beatmixxxx.state.global.shifted);
                }
            });

            this.registerListener({
                name: "volume",
                canChangePosition: false,
                onInput: function (deck, value) {
                    Beatmixxxx.midiInput.softTakeover.midiInput(deck.group, "volume", value, !Beatmixxxx.state.global.shifted);

                }
            });

            this.registerListener({
                name: "rate",
                onInput: function (deck, value) {
                    var rate = script.absoluteLin(value, 1, -1, 0x00, 0x7F);
                    deck.setValue("rate", rate);
                }
            });

            this.registerListener({
                name: "leftDeckSwitch",
                noDeck: true,
                onDownNonShifted: function () {
                    script.toggleControl("[Master]", "maximize_library");
                }
            });

            this.registerListener({
                name: "pitchPlus",
                noDeck: true,
                onDownNonShifted: function (_value, control, channel) {
                    Beatmixxxx.decks.sides.modifierPressed(1, 0x24, channel);
                }
            });

            this.registerListener({
                name: "pitchMinus",
                noDeck: true,
                onDownNonShifted: function (_value, control, channel) {
                    Beatmixxxx.decks.sides.modifierPressed(2, 0x25, channel);
                }
            });

            this.registerListener({
                name: "wheelTouch",
                onDownNonShifted: function (deck) {
                    var alpha = 1.0/8;
                    var beta = alpha / 32;
                    engine.scratchEnable(deck.number, 256, 33 + 1/3, alpha, beta);
                },
                onUpNonShifted: function (deck) {
                    engine.scratchDisable(deck.number);
                }
            });

            this.registerListener({
                name: "wheelRotate",
                onInput: function (deck, value) {
                    var speed = value - 0x40;
                    if (Beatmixxxx.state.global.shifted) {
                        speed *= 10;
                    }
                    if (engine.isScratching(deck.number)) {
                        engine.scratchTick(deck.number, speed);
                    } else {
                        deck.setValue("jog", speed);
                    }
                }
            });

            this.registerListener({
                name: "pfl",
                canChangePosition: false,
                onDownNonShifted: function (deck) {
                    deck.toggleValue("pfl");
                }
            });

            this.registerListener({
                name: "gainKnob",
                canChangePosition: false,
                onInputNonShifted: function (deck, value) {
                    Beatmixxxx.midiInput.softTakeover.midiInput(deck.group, "pregain", value, !Beatmixxxx.state.global.shifted);
                }
            });

            this.registerListener({
                name: "highKnob",
                canChangePosition: false,
                onInputShifted: function (deck, value) {
                    // high
                    Beatmixxxx.midiInput.softTakeover.midiInput("[EqualizerRack1_" + deck.group + "_Effect1]", "parameter3", value, Beatmixxxx.state.global.shifted);
                }
            });

            this.registerListener({
                name: "midKnob",
                canChangePosition: false,
                onInputShifted: function (deck, value) {
                    // mid
                    Beatmixxxx.midiInput.softTakeover.midiInput("[EqualizerRack1_" + deck.group + "_Effect1]", "parameter2", value, Beatmixxxx.state.global.shifted);
                }
            });

            this.registerListener({
                name: "lowKnob",
                canChangePosition: false,
                onInput: function (deck, value) {
                    // low
                    Beatmixxxx.midiInput.softTakeover.midiInput("[EqualizerRack1_" + deck.group + "_Effect1]", "parameter1", value, Beatmixxxx.state.global.shifted);
                    // filter
                    Beatmixxxx.midiInput.softTakeover.midiInput("[QuickEffectRack1_" + deck.group + "]", "super1", value, !Beatmixxxx.state.global.shifted);
                }
            });

            this.registerListener({
                name: "padModeA",
                noDeck: true,
                onUpNonShifted: function (_value, _control, channel) {
                    Beatmixxxx.state.side.fromChannel(channel).setA();
                }
            });

            this.registerListener({
                name: "padModeB",
                noDeck: true,
                onUpNonShifted: function (_value, _control, channel) {
                    Beatmixxxx.state.side.fromChannel(channel).setB();
                }
            });

            var midiSetup = this;

            _.forEach(_.range(4), function (padIndex) {
                midiSetup.registerListener({
                    name: "bluePad" + padIndex,
                    onBinaryInput: function (deck, down, _control, channel) {
                        var sideState = Beatmixxxx.state.side.fromChannel(channel);

                        if (sideState.isA()) {
                            if (down) {
                                if (Beatmixxxx.state.global.shifted) {
                                    deck.setValue("hotcue_" + (padIndex + 1) + "_clear");
                                } else {
                                    deck.setValue("hotcue_" + (padIndex + 1) + "_activate", true);
                                }
                            } else {
                                deck.setValue("hotcue_" + (padIndex + 1) + "_activate", false);
                            }
                        }
                    }
                });
            });
        },

        registerListener: function (listener) {
            this[("control" + _.upperFirst(listener.name))] = function (channel, control, value, status, _group) {

                listener.canChangePosition = _.defaultTo(listener.canChangePosition, true);

                if (!listener.noDeck) {
                    // this deck variable is actually declared and accessible outside of the "if" because JavaScript
                    var deck = Beatmixxxx.decks.fromChannel(channel, listener.canChangePosition);

                    // shortcut function
                    listener.setLed = function (lit, shiftOffset) {
                        deck.setLed(control, lit, shiftOffset);
                    };
                }

                var down = (value === Beatmixxxx.midiInput.values.DOWN);

                _([
                    listener.onBinaryInput,
                    Beatmixxxx.state.global.shifted ? listener.onBinaryInputShifted : _.noop,
                    !Beatmixxxx.state.global.shifted ? listener.onBinaryInputNonShifted : _.noop
                ])
                    .filter(_.negate(_.isUndefined))
                    .forEach(function (func) {
                        if (_.isUndefined(deck)) {
                            func(down, control, channel, status);
                        } else {
                            func(deck, down, control, channel, status);
                        }
                    });

                _([
                    listener.onInput,
                    Beatmixxxx.state.global.shifted ? listener.onInputShifted : _.noop,
                    !Beatmixxxx.state.global.shifted ? listener.onInputNonShifted : _.noop,

                    listener[down ? "onDown" : "onUp"],
                    Beatmixxxx.state.global.shifted ? listener[down ? "onDownShifted" : "onUpShifted"] : _.noop,
                    !Beatmixxxx.state.global.shifted ? listener[down ? "onDownNonShifted" : "onUpNonShifted"] : _.noop
                ])
                    .filter(_.negate(_.isUndefined))
                    .forEach(function (func) {
                        if (_.isUndefined(deck)) {
                            func(value, control, channel, status);
                        } else {
                            func(deck, value, control, channel, status);
                        }
                    });

                if (!_.isUndefined(deck)
                    && !_.isUndefined(listener.led)
                    && !_.isUndefined(listener.led.midiNumber)
                    && !_.isUndefined(listener.led.behavior)) {

                    var set = function (lit) {
                        if (listener.canChangePosition) {
                            deck.setLed(listener.led.midiNumber, lit, listener.led.shiftOffset);
                        } else {
                            Beatmixxxx.leds.set(channel, listener.led.midiNumber, lit, listener.led.shiftOffset);
                        }
                    };

                    if (down) {
                        if (
                            listener.led.behavior === "both" ||
                            listener.led.behavior === "shifted" && Beatmixxxx.state.global.shifted ||
                            listener.led.behavior === "nonShifted" && !Beatmixxxx.state.global.shifted
                        ) {
                            set(true);
                        }
                    } else {
                        set(false);
                    }
                }
            }
        },

        softTakeover: {
            setup: function () {
                var defaultSoftTakeoverEntry = {
                    isInSync: false, // try if hardware and software control are in sync
                    lastSetControlValue: 0.0, // last control value set by this script
                    takeoverRange: 0.05,
                    roundingPrecision: 2, // rounding may actually not be needed

                    offerNewValue: function (group, parameter, value) {
                        var engineValue = engine.getParameter(group, parameter);
                        var diff = _.max([value, engineValue]) - _.min([value, engineValue]);

                        if (diff < this.takeoverRange || this.isInSync) {
                            engine.setParameter(group, parameter, value);

                            this.lastSetControlValue = value;
                            this.isInSync = true;
                        }
                    },

                    hardwareMoved: function (group, parameter, value) {
                        this.isInSync = value === _.round(engine.getParameter(group, parameter), this.roundingPrecision);
                    },

                    scaleMidiValue: function (value) {
                        if (!_.isUndefined(this.controlMid)) {
                            return script.absoluteNonLin(value, this.controlLow, this.controlMid, this.controlHigh, this.midiMin, this.midiMax);

                        } else {
                            return script.absoluteLin(value, this.controlLow, this.controlHigh, this.midiMin, this.midiMax);
                        }
                    }
                };

                var makeLinearSoftTakeoverEntry = function (controlLow, controlHigh, midiMin, midiMax) {

                    var entry = _.clone(defaultSoftTakeoverEntry);

                    if (_.isUndefined(midiMin)) {
                        midiMin = 0x00;
                    }
                    if (_.isUndefined(midiMax)) {
                        midiMax = 0x7F;
                    }

                    entry.controlLow = controlLow;
                    entry.controlHigh = controlHigh;
                    entry.hardwareMin = midiMin;
                    entry.hardwareMax = midiMax;

                    return entry;
                };

                var makeNonLinearSoftTakeoverEntry = function (controlLow, controlMid, controlHigh, midiMin, midiMax) {
                    var entry = makeLinearSoftTakeoverEntry(controlLow, controlHigh, midiMin, midiMax);
                    entry.controlMid = controlMid;

                    return entry
                };

                Beatmixxxx.midiInput.softTakeover.list = {
                    "[Master]": {
                        "crossfader": makeLinearSoftTakeoverEntry(-1, 1)
                    }
                };

                _.forEach(Beatmixxxx.decks.getAll(), function (deck) {
                    engine.softTakeover(deck.group, "rate", true);

                    Beatmixxxx.midiInput.softTakeover.list["[EqualizerRack1_" + deck.group + "_Effect1]"] = {
                        "parameter1": makeLinearSoftTakeoverEntry(0, 1), // low
                        "parameter2": makeLinearSoftTakeoverEntry(0, 1), // mid
                        "parameter3": makeLinearSoftTakeoverEntry(0, 1) // high
                    };


                    Beatmixxxx.midiInput.softTakeover.list["[QuickEffectRack1_" + deck.group + "]"] = {
                        "super1": makeLinearSoftTakeoverEntry(0, 1) // filter
                    };

                    Beatmixxxx.midiInput.softTakeover.list[deck.group] = {
                        "pregain": makeLinearSoftTakeoverEntry(0, 1),
                        "volume": makeLinearSoftTakeoverEntry(0, 1)
                    };
                });

                this.forEachEntry(function (group, parameter, entry) {
                    engine.makeConnection(group, parameter, Beatmixxxx.midiInput.softTakeover.controlValueChangedFunction(group, parameter, entry));
                });
            },

            midiInput: function (group, parameter, midiValue, affectsControl) {
                var entry = this.list[group][parameter];

                var roundedValue = _.round(entry.scaleMidiValue(midiValue), entry.roundingPrecision);

                if (affectsControl) {
                    entry.offerNewValue(group, parameter, roundedValue);
                }
                entry.hardwareMoved(group, parameter, roundedValue);
            },

            controlValueChangedFunction: function (group, parameter, entry) {
                return function (_value) { // don't use the passed value because it is not scaled unlike getParameter
                    var externalValue = _.round(engine.getParameter(group, parameter), entry.roundingPrecision);
                    entry.isInSync = entry.lastSetControlValue === externalValue;
                };
            },

            onDeckChanged: function () {
                _.forEach(Beatmixxxx.decks.getAll(), function (deck) {
                    engine.softTakeoverIgnoreNextValue(deck.group, "rate");
                });
            },

            forEachEntry: function (func) {
                _.forEach(this.list, function (entries, group) {
                    _.forEach(entries, function (entry, parameter) {
                        func(group, parameter, entry);
                    });
                });
            },

            list: {} // filled in setup()
        }
    },

    leds: {
        values: {
            ON: 0x7F,
            OFF: 0x00
        },

        set: function (channel, control, status, shiftOffset) {
            midi.sendShortMsg(0x90 + channel, control, Beatmixxxx.leds.values[status ? "ON" : "OFF"]);
            if (!_.isUndefined(shiftOffset)) {
                midi.sendShortMsg(0x90 + channel, control + shiftOffset, Beatmixxxx.leds.values[status ? "ON" : "OFF"]);
            }
        }
    },

    init: function () {
        print("Hello there!");
    },

    shutdown: function () {

    }
};

Beatmixxxx.state.side.setup();
Beatmixxxx.decks.setup();
Beatmixxxx.midiInput.setup();
_.forEach(Beatmixxxx.decks.getAll(), function (deck) {
    deck.triggerConnections();
});