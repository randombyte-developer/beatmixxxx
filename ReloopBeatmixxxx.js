var Beatmixxxx = {

    // TODO put all used constants in here
    constants: {
        timings: {
            readyToPlayBlinkingInterval: 500
        },

        midi: {
            leds: {
                values: {
                    ON: 0x7F,
                    OFF: 0x00,

                    RED: 0x7F,
                    BLUE: 0x2B,
                    VIOLET: 0x2A
                },

                play: {
                    number: 0x23,
                    offset: 0x40 // shift offset
                },
                pads: {
                    numbers: _.range(0x00, 0x08),
                    offset: 0x40
                }
            }
        }
    },

    state: {
        global: {
            shifted: false,
            playIndicatorLit: false
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
                    beatloopSizePressed: false,
                    beatjumpSizePressed: false,

                    setA: function () {
                        this.modeA = true;
                        this.modeB = false;
                        this.onModeSwitched();
                    },
                    setB: function () {
                        this.modeB = true;
                        this.modeA = false;
                        this.onModeSwitched();
                    },
                    setAB: function () {
                        this.modeA = true;
                        this.modeB = true;
                        this.onModeSwitched();
                    },

                    isA: function () {
                        return this.modeA === true && this.modeB === false;
                    },
                    isB: function () {
                        return this.modeB === true && this.modeA === false;
                    },
                    isAB: function () {
                        return this.modeA === true && this.modeB === true;
                    },

                    onModeSwitched: function () {
                        Beatmixxxx.decks.sides.onModeSwitched(this.sideObject);
                    }
                };

                this.left = _.defaults(_.clone(defaultSideState), {
                    sideObject: Beatmixxxx.decks.sides.left
                });
                this.right = _.defaults(_.clone(defaultSideState), {
                    sideObject: Beatmixxxx.decks.sides.right
                });
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

            setDeck: function (side, deck) {
                side.deck = deck;

                Beatmixxxx.midiInput.softTakeover.onDeckChanged();
                Beatmixxxx.decks[side.deck].triggerConnections();
            },

            onModeSwitched: function (side) {
                _.forEach(Beatmixxxx.constants.midi.leds.pads.numbers, function (padMidiNumber) {
                    _.forEach(side.channels, function (channel) {
                        Beatmixxxx.leds.set(channel, padMidiNumber, false, Beatmixxxx.constants.midi.leds.pads.offset);
                    });
                });

                Beatmixxxx.decks[side.deck].triggerConnections();
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
                effectUnit: ((number + 1) % 2) + 1, // yeah that works, (deck, effectUnit): (1, 1), (2, 2), (3, 1), (4, 2)

                connections: [],

                setup: function () {
                    var deck = this;

                    var playLed = Beatmixxxx.constants.midi.leds.play;

                    deck.connections = _.concat(deck.connections, [
                        this.makeConnection("loop_enabled", function (value) {
                            Beatmixxxx.leds.set(deck.number, 0x04, value, 0x40);
                        }),
                        this.makeConnection("pfl", function (value) { Beatmixxxx.leds.set(deck.number, 0x52, value, 0x20); }),
                        this.makeConnection("quantize", function (value) { Beatmixxxx.leds.set(deck.number, 0x25, value, 0x40); }),
                        this.makeConnection("play", function (value) {
                            if (value) {
                                Beatmixxxx.leds.set(deck.number, playLed.number, true, playLed.offset);
                            }
                        }),
                        this.makeConnection("track_loaded", function (value) {
                            if (!value) {
                                Beatmixxxx.leds.set(deck.number, playLed.number, false, playLed.offset);
                            }
                        })
                    ]);

                    deck.connections = _.concat(deck.connections, _.map(_.range(4), function (padIndex) {
                        return deck.makeConnection("hotcue_" + (padIndex + 1) + "_enabled", function (value) {
                            _.forEach(deck.getChannels(), function (channel) {
                                var side = Beatmixxxx.decks.sides.fromChannel(channel);
                                if (!_.isUndefined(side) && Beatmixxxx.state.side[side.name].isA()) {
                                    Beatmixxxx.leds.set(channel, padIndex, value, Beatmixxxx.constants.midi.leds.pads.offset);
                                }
                            });
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

        scaleMidiValue: function (value) {
            return script.absoluteLin(value, 0, 1, 0x00, 0x7F);
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
                onBinaryInputNonShifted: function (deck, down) {
                    deck.setValue("sync_enabled", down);
                },
                onDownShifted: function (deck, down) {
                    if (deck.getValue("sync_mode") === 2) { // is master?
                        deck.setValue("sync_mode", 0); // no sync
                    } else {
                        deck.setValue("sync_mode", 2); // none
                    }
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
                onInput: function (value) {
                    var speed = value - Beatmixxxx.midiInput.values.ENCODER_OFFSET;
                    if (Beatmixxxx.state.global.shifted) {
                        speed *= 5;
                    }
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
                    engine.setParameter("[Master]", "crossfader", Beatmixxxx.midiInput.scaleMidiValue(value));
                }
            });

            this.registerListener({
                name: "volume",
                canChangePosition: false,
                onInput: function (deck, value) {
                    engine.setParameter(deck.group, "volume", Beatmixxxx.midiInput.scaleMidiValue(value));
                }
            });

            this.registerListener({
                name: "rate",
                onInput: function (deck, value, control, _channel, status) {
                    var rate = -script.midiPitch(control, value, status);
                    deck.setValue("rate", rate);
                }
            });

            this.registerListener({
                name: "leftDeckSwitch",
                noDeck: true,
                onDown: function (_value) {
                    var side = Beatmixxxx.decks.sides.left;
                    Beatmixxxx.decks.sides.setDeck(side, 1 == side.deck ? 3 : 1);                    
                }
            });

            this.registerListener({
                name: "rightDeckSwitch",
                noDeck: true,
                onDown: function () {
                    var side = Beatmixxxx.decks.sides.right;
                    Beatmixxxx.decks.sides.setDeck(side, 2 == side.deck ? 4 : 2);
                }
            });

            this.registerListener({
                name: "back",
                noDeck: true,
                canChangePosition: false,
                onDownNonShifted: function (_value, control, channel) {
                    script.toggleControl("[Master]", "maximize_library");
                },
                onDownShifted: function (_value, control, channel) {
                    script.toggleControl("[Master]", "headSplit");
                }
            });

            this.registerListener({
                name: "pitchMinus",
                onDownNonShifted: function (deck) {
					var isLeft = Beatmixxxx.decks.sides.fromChannel(deck.number).name === "left";
					var samplerNum = (isLeft ? 1 : 6);
					// move preset selection to previous, or decrease activated lights
					engine.setValue("[Sampler" + samplerNum + "]", "volume", 1);
				},
                onDownShifted: function (deck) {
                    deck.toggleValue("quantize");
                }
            });

            this.registerListener({
                name: "pitchPlus",
                onDownNonShifted: function (deck) {
					var isLeft = Beatmixxxx.decks.sides.fromChannel(deck.number).name === "left";
					var samplerNum = (isLeft ? 2 : 7);
					// move preset selection to next, or increase activated lights
					engine.setValue("[Sampler" + samplerNum + "]", "volume", 1);
				}
            });

            this.registerListener({
                name: "wheelTouch",
                onDown: function (deck) {
                    var alpha = 1.0/8;
                    var beta = alpha / 32;
                    engine.scratchEnable(deck.number, 256, 33 + 1/3, alpha, beta);
                },
                onUp: function (deck) {
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
                },
                onBinaryInputShifted: function (deck, down) {
                    if (!deck.getValue("play")) { // only eject if not playing
                        deck.setValue("eject", down);
                    }
                }
            });

            this.registerListener({
                name: "gainKnob",
                canChangePosition: false,
                onInputNonShifted: function (deck, value) {
                    engine.setParameter(deck.group, "pregain", Beatmixxxx.midiInput.scaleMidiValue(value));
                }
            });

            this.registerListener({
                name: "highKnob",
                canChangePosition: false,
                onInput: function (deck, value) {
                    // high
                    engine.setParameter("[EqualizerRack1_" + deck.group + "_Effect1]", "parameter3", Beatmixxxx.midiInput.scaleMidiValue(value));
                }
            });

            this.registerListener({
                name: "midKnob",
                canChangePosition: false,
                onInput: function (deck, value) {
                    // mid
                    engine.setParameter("[EqualizerRack1_" + deck.group + "_Effect1]", "parameter2", Beatmixxxx.midiInput.scaleMidiValue(value));
                }
            });

            this.registerListener({
                name: "lowKnob",
                canChangePosition: false,
                onInput: function (deck, value) {
                    // low
                    engine.setParameter("[EqualizerRack1_" + deck.group + "_Effect1]", "parameter1", Beatmixxxx.midiInput.scaleMidiValue(value))
                }
            });

            var midiSetup = this;

            _.times(3, function (effectIndex) {

                midiSetup.registerListener({
                    name: "effectButton" + effectIndex,
                    onBinaryInput: function (deck, down) {
                        var effectGroup = "[EffectRack1_EffectUnit" + deck.effectUnit + "_Effect" + (effectIndex + 1) + "]";
                        engine.setParameter(effectGroup, "enabled", down);
                    }
                });

                midiSetup.registerListener({
                    name: "effectKnob" + effectIndex,
                    onInput: function (deck, value) {
                        var effectGroup = "[EffectRack1_EffectUnit" + deck.effectUnit + "_Effect" + (effectIndex + 1) + "]";
                        engine.setParameter(effectGroup, "meta", Beatmixxxx.midiInput.scaleMidiValue(value));
                    }
                });
            });

            // TODO handle the A&B mode correctly
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

            this.registerListener({
                name: "effectsEncoder",
                onInput: function (deck, value, _control, channel) {
                    var sideState = Beatmixxxx.state.side.fromChannel(channel);
                    var speed = value - 0x40;

                    if (sideState.beatloopSizePressed) {
                        deck.setValue(speed > 0 ? "loop_double" : "loop_halve");
                    } else if (sideState.beatjumpSizePressed) {
                        var beatjumpSize = deck.getValue("beatjump_size");
                        beatjumpSize = speed > 0 ? beatjumpSize * 2 : beatjumpSize / 2;
                        beatjumpSize = _.min([_.max([0.03125, beatjumpSize]), 64]); // coerce value
                        deck.setValue("beatjump_size", beatjumpSize);
                    }
                }
            });

			this.registerListener({
				name: "effectsButton",
				onBinaryInputNonShifted: function (deck, down) {
					var isLeft = Beatmixxxx.decks.sides.fromChannel(deck.number).name === "left";
					var samplerNum = isLeft ? 3 : 4;
					engine.setValue("[Sampler" + samplerNum + "]", "volume", down ? 1 : 0);
				},
				onDownShifted: function (deck) {
					var isLeft = Beatmixxxx.decks.sides.fromChannel(deck.number).name === "left";
					var samplerNum = isLeft ? 8 : 9;
					engine.setValue("[Sampler" + samplerNum + "]", "volume", 1);
				}
			});

			this.registerListener({
                name: "samplerVolume",
				noDeck: true,
                canChangePosition: false,
                onInput: function (value) {
                    engine.setValue("[Sampler5]", "volume", Beatmixxxx.midiInput.scaleMidiValue(value));
                }
            });

            // todo reduce duplicated A&B mode code

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

            midiSetup.registerListener({
                name: "bluePad4",
                onDownNonShifted: function (deck, down, _control, channel) {
                    var sideState = Beatmixxxx.state.side.fromChannel(channel);

                    if (sideState.isA() && down) {
                        if (deck.getValue("loop_enabled")) {
                            var beatloopSize = deck.getValue("beatloop_size");
                            deck.setValue("beatloop_" + beatloopSize + "_toggle");
                        } else {
                            deck.setValue("beatloop_activate");
                        }
                    }
                }
            });

            midiSetup.registerListener({
                name: "bluePad5",
                onBinaryInputNonShifted: function (deck, down, _control, channel) {
                    var sideState = Beatmixxxx.state.side.fromChannel(channel);
                    sideState.beatloopSizePressed = sideState.isA() && down;
                }
            });

            midiSetup.registerListener({
                name: "bluePad6",
                onBinaryInput: function (deck, down, _control, channel) {
                    var sideState = Beatmixxxx.state.side.fromChannel(channel);
                    if (sideState.isA()) {
                        if (down) {
                            if (Beatmixxxx.state.global.shifted) {
                                sideState.beatjumpSizePressed = true;
                            } else {
                                deck.setValue("beatjump_backward", true);
                            }
                        } else {
                            sideState.beatjumpSizePressed = false;
                            deck.setValue("beatjump_backward", false);
                        }
                    }
                }
            });

            midiSetup.registerListener({
                name: "bluePad7",
                onBinaryInput: function (deck, down, _control, channel) {
                    var sideState = Beatmixxxx.state.side.fromChannel(channel);
                    if (sideState.isA()) {
                        if (down) {
                            if (!Beatmixxxx.state.global.shifted) {
                                deck.setValue("beatjump_forward", true);
                            }
                        } else {
                            deck.setValue("beatjump_forward", false);
                        }
                    }
                }
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
                    isInSync: false, // if hardware and software control are in sync
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
                    }
                };

                Beatmixxxx.midiInput.softTakeover.list = {
                    "[Master]": {
                        "crossfader": _.clone(defaultSoftTakeoverEntry)
                    }
                };

                _.forEach(Beatmixxxx.decks.getAll(), function (deck) {
                    engine.softTakeover(deck.group, "rate", true);
                });

                this.forEachEntry(function (group, parameter, entry) {
                    engine.makeConnection(group, parameter, Beatmixxxx.midiInput.softTakeover.controlValueChangedFunction(group, parameter, entry));
                });
            },

            midiInput: function (group, parameter, midiValue, affectsControl) {
                var entry = this.list[group][parameter];

                var roundedValue = _.round(Beatmixxxx.midiInput.scaleMidiValue(midiValue), entry.roundingPrecision);

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
        set: function (channel, control, status, shiftOffset, color) {
            if (_.isUndefined(color)) {
                color = Beatmixxxx.constants.midi.leds.values.ON;
            }

            var value = status ? color : Beatmixxxx.constants.midi.leds.values.OFF;

            midi.sendShortMsg(0x90 + channel, control, value);
            if (!_.isUndefined(shiftOffset)) {
                midi.sendShortMsg(0x90 + channel, control + shiftOffset, value);
            }
        }
    },

    init: function () {
        print("Hello there!");

        this.setup();
    },

    setup: function () {
        Beatmixxxx.state.side.setup();
        Beatmixxxx.decks.setup();
        Beatmixxxx.midiInput.setup();
        _.forEach(Beatmixxxx.decks.getAll(), function (deck) {
            deck.triggerConnections();
        });

        // ready to play, button blinking
        engine.beginTimer(Beatmixxxx.constants.timings.readyToPlayBlinkingInterval, function () {

            Beatmixxxx.state.global.playIndicatorLit = !Beatmixxxx.state.global.playIndicatorLit;

            var playLed = Beatmixxxx.constants.midi.leds.play;

            _.forEach(Beatmixxxx.decks.getAll(), function (deck) {
                if (!deck.getValue("play") && deck.getValue("track_loaded")) {
                    _.forEach(deck.getChannels(), function (channel) {
                        Beatmixxxx.leds.set(channel, playLed.number, Beatmixxxx.state.global.playIndicatorLit, playLed.offset);
                    });
                }
            });
        });
    },

    shutdown: function () {

    }
};
