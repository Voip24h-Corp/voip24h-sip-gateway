import Janus from "janus-gateway-with-adapter";
import { EventSipGateway, EventHangup } from "./EventSipGateway";
import $, { error } from "jquery";

class Voip24hModule {
    constructor() {
        this.server = this._setServer();
        this.iceServers = null;
        this.janus = null;
        this.sipHandle = null;
        this.sipcall = null;
        this.sipcallHelper = null;
        this.opaqueId = "siptest-" + Janus.randomString(12);
        this.localTracks = {};
        this.remoteTracks = {};
        this.registered = false;
        this.registeredHelper = false;
        this.helpers = {};
        this.helpersCount = 0;
        this.checkHold = null;
        this.checkHoldHelper = null;
        this.ip;
        this.doAudio = true;
        this.dataJsep;
        this.dataJsepHelper;
        this.offerlessInvite = false;
        this.checkRegistered;
        this.checkRegisteredHelper;
        this.checkDevice = true;
        this.referId;
        this.referIdHelper;
        this.statusCallCurrent = null;
        this.debug = "false";
    }

    _setServer() {
        const rndInt = Math.floor(Math.random() * 100) + 1;
        return (rndInt % 2 === 0) ? "https://janus3.voip24h.vn/janus" : "https://janus4.voip24h.vn/janus";
    }

    static getInstance(debug2) {
        if (!Voip24hModule.instance) {
            Voip24hModule.instance = new Voip24hModule();
        }
        Voip24hModule.instance.debug = debug2;
        return Voip24hModule.instance;
    }

    async initializeModule() {
        return new Promise((resolve, reject) => {
            Janus.init({
                debug: this.debug,
                callback: () => {
                    if (!Janus.isWebrtcSupported()) {
                        return;
                    }

                    const iOS = ['iPad', 'iPhone', 'iPod'].indexOf(navigator.platform) >= 0;
                    const eventName = iOS ? 'pagehide' : 'beforeunload';
                    const oldOBF = window["on" + eventName];
                    window.addEventListener(eventName, () => {
                        for (let s in Janus.sessions) {
                            if (Janus.sessions[s] && Janus.sessions[s].destroyOnUnload) {
                                Janus.log("Destroying session " + s);
                                Janus.sessions[s].destroy({ unload: true, notifyDestroyed: false });
                            }
                        }
                        if (oldOBF && typeof oldOBF === "function") {
                            oldOBF();
                        }
                    });

                    this.janus = new Janus({
                        server: this.server,
                        iceServers: this.iceServers,
                        success: () => this._attachPlugin(resolve, reject),
                        error: (error) => {
                            Janus.error(error);
                            this._handleJanusError(error);
                            reject(error);
                        },
                        destroyed: () => this._handleJanusDestroyed()
                    });
                }
            });
        });
    }

    _attachPlugin(resolve, reject) {
        this.janus.attach({
            plugin: "janus.plugin.sip",
            opaqueId: this.opaqueId,
            success: (pluginHandle) => {
                this.sipcall = pluginHandle;
                Janus.log("Plugin attached! (" + this.sipcall.getPlugin() + ", id=" + this.sipcall.getId() + ")");
                resolve();
            },
            error: (error) => {
                Janus.error("  -- Error attaching plugin...", error);
                reject(error);
            },
            consentDialog: (on) => {
                Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
            },
            iceState: (state) => {
                Janus.log("ICE state changed to " + state);
            },
            mediaState: (medium, on, mid) => {
                Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium + " (mid=" + mid + ")");
            },
            webrtcState: (on) => {
                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            slowLink: (uplink, lost, mid) => {
                Janus.warn("Janus reports problems " + (uplink ? "sending" : "receiving") + " packets on mid " + mid + " (" + lost + " lost packets)");
            },
            onmessage: (msg, jsep) => this._handleOnMessage(msg, jsep),
            onlocaltrack: (track, on) => this._handleOnLocalTrack(track, on),
            onremotetrack: (track, mid, on) => this._handleOnRemoteTrack(track, mid, on),
            oncleanup: () => this._handleOnCleanup()
        });
    }

    _handleOnMessage(msg, jsep) {
        Janus.debug(" ::: Got a message :::", msg);
        const error = msg["error"];
        if (error) {
            if (this.registered) {
                this.sipcall.hangup();
            }
            return;
        }
        const callId = msg["call_id"];
        const result = msg["result"];
        const dataCallback = {};
        let pushEvent = this.statusCallCurrent?.onmessageOutSide;
        if (result && result["event"]) {
            let event = result["event"];
            switch (event) {
                case EventSipGateway.RegistrationFailed:
                    this.checkRegistered = "";
                    event = EventSipGateway.RegistrationFailed;
                    Janus.warn("Registration failed: " + result["code"] + " " + result["reason"]);
                    break;
                case EventSipGateway.Registered:
                    event = EventSipGateway.Registered;
                    this._handleRegistered(result, jsep);
                    break;
                case EventSipGateway.Calling:
                    event === EventSipGateway.Calling
                    Janus.log("Waiting for the peer to answer...");
                    break;
                case EventSipGateway.Incomingcall:
                    this._handleIncomingCall(result, jsep, callId, dataCallback);
                    return;
                case EventSipGateway.Accepting:
                    return;
                case EventSipGateway.Progress:
                    event = EventSipGateway.Progress;
                    this._handleProgress(result, jsep);
                    break;
                case EventSipGateway.Accepted:
                    event = EventSipGateway.Accepted;
                    this._handleAccepted(result, jsep, callId);
                    break;
                case EventSipGateway.Transfer:
                    event = EventSipGateway.Transfer;
                    this._handleTransfer(result);
                    break;
                case EventSipGateway.Hangup:
                    this._handleHangup(result);
                    return;
                case EventSipGateway.Holding:
                    this.checkHold = EventSipGateway.Holding;
                    event = EventSipGateway.Holding;
                    break;
                default:
                    this.checkHold = "";
                    event = EventSipGateway.Unholding;
            }
            pushEvent(event.toEventSipGateWay(), dataCallback);
        }
    }

    _handleRegistered(result, jsep) {
        this.checkRegistered = EventSipGateway.Registered;
        Janus.log("Successfully registered as " + result["username"] + "!");
        this.registered = true;
        this.master_id = result["master_id"];
        const div1 = document.createElement('div');
        div1.innerHTML = `<div class="hide" id="audiostream"></div>`;
        document.body.insertAdjacentElement('afterbegin', div1);
    }

    _handleIncomingCall(result, jsep, callId, dataCallback) {
        Janus.log("Incoming call from " + result["username"] + "!");
        this.sipcall.callId = callId;
        const parts = result["username"].split(":");
        const partsPhone = parts[1].split("@");
        const phoneNumber = partsPhone[0];
        this.doAudio = true;
        if (jsep) {
            this.doAudio = (jsep.sdp.indexOf("m=audio ") > -1);
            Janus.debug("Audio " + (this.doAudio ? "has" : "has NOT") + " been negotiated");
        } else {
            Janus.log("This call doesn't contain an offer... we'll need to provide one ourselves");
            this.offerlessInvite = true;
        }
        let transfer = "";
        const referredBy = result["referred_by"];
        if (referredBy) {
            transfer = " (referred by " + referredBy + ")";
            transfer = transfer.replace(new RegExp('<', 'g'), '&lt');
            transfer = transfer.replace(new RegExp('>', 'g'), '&gt');
        }
        let rtpType = "";
        const srtp = result["srtp"];
        if (srtp === "sdes_optional")
            rtpType = " (SDES-SRTP offered)";
        else if (srtp === "sdes_mandatory")
            rtpType = " (SDES-SRTP mandatory)";
        let extra = "";
        if (this.offerlessInvite) {
            extra = " (no SDP offer provided)";
        }
        this.dataJsep = jsep;
        // dataCallback = { 'phonenumber': phoneNumber }
        let pushEvent = this.statusCallCurrent?.onmessageOutSide;
        dataCallback.phonenumber = phoneNumber;
        const event = EventSipGateway.Incomingcall;
        if (pushEvent) {
            pushEvent(event.toEventSipGateWay(), dataCallback);
        }
    }

    _handleProgress(result, jsep) {
        Janus.log("There's early media from " + result["username"] + ", waiting for the call!", jsep);
        if (jsep) {
            this.sipcall.handleRemoteJsep({
                jsep: jsep,
                error: () => {
                    const hangup = { request: "hangup" };
                    this.sipcall.send({ message: hangup });
                    this.sipcall.hangup();
                }
            });
        }
    }

    _handleAccepted(result, jsep, callId) {
        this.sipcall.callId = callId;
        Janus.log(result["username"] + " accepted the call!", jsep);
        if (jsep) {
            this.sipcall.handleRemoteJsep({
                jsep: jsep,
                error: () => {
                    const hangup = { request: "hangup" };
                    this.sipcall.send({ message: hangup });
                    this.sipcall.hangup();
                }
            });
        }
    }

    _handleTransfer(result) {
        Janus.log(result["username"] + " is being transferred!", result);
    }

    _handleHangup(result) {
        Janus.log("Call hung up (" + result["code"] + " " + result["reason"] + ")!");
        this.dataJsep = "";
        this.sipcall.hangup();
        this.sipcall.callId = null;
        this.doAudio = true;
        this.offerlessInvite = false;
        const dataCallback = {};
        let event = EventSipGateway.Hangup;
        const reasonHangup = result["reason"];
        switch (reasonHangup) {
            case EventHangup.BusyHere:
                event = EventSipGateway.Reject;
                dataCallback.message = reasonHangup;
                break;
            case EventHangup.ToBye:
                event = EventSipGateway.EmployerHangup;
                break;
            case EventHangup.SessionTerminated:
                event = EventSipGateway.CustomerHangup;
                break;
            case EventHangup.RequestTerminated:
                event = EventSipGateway.Missed;
                break;
            default:
                event = EventSipGateway.Hangup;
        }
        let pushEvent = this.statusCallCurrent?.onmessageOutSide;
        if (pushEvent) {
            pushEvent(event.toEventSipGateWay(), dataCallback);
        }
    }

    _handleOnLocalTrack(track, on) {
        Janus.debug("Local track " + (on ? "added" : "removed") + ":", track);
		var trackId = track.id.replace(/[{}]/g, "");
		if(!on) {
			// Track removed, get rid of the stream and the rendering
			var stream = this.localTracks[trackId];
			if(stream) {
				try {
					var tracks = stream.getTracks();
					for(var i in tracks) {
						var mst = tracks[i];
						if(mst)
							mst.stop();
					}
				} catch(e) {}
			}
			delete this.localTracks[trackId];
			return;
		}
		// If we're here, a new track was added
		var stream = this.localTracks[trackId];
		if(stream) {
			// We've been here already
			return;
		}
		if(track.kind === "audio") {
			// We ignore local audio tracks, they'd generate echo anyway
		} else {
			// New video track: create a stream out of it
		}
		if(this.sipcall.webrtcStuff.pc.iceConnectionState !== "completed" &&
				this.sipcall.webrtcStuff.pc.iceConnectionState !== "connected") {
		}
    }

    _handleOnRemoteTrack(track, mid, on) {
        Janus.debug("Remote track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
		if(!on) {
			// Track removed, get rid of the stream and the rendering
			$('#peervideom' + mid).remove();
			delete this.remoteTracks[mid];
			return;
		}
		// If we're here, a new track was added
		if(track.kind === "audio") {
			// New audio track: create a stream out of it, and use a hidden <audio> element
			const stream = new MediaStream([track]);
			this.remoteTracks[mid] = stream;
			Janus.log("Created remote audio stream:", stream);
			$('#audiostream').append('<audio class="hide" id="peervideom' + mid + '" autoplay playsinline/>');
			Janus.attachMediaStream($('#peervideom' + mid).get(0), stream);
		}
    }

    _handleOnCleanup() {
        Janus.log(" ::: Got a cleanup notification :::");
		$('#audiostream').empty();
		if(this.sipcall) {
			delete this.sipcall.callId;
			delete this.sipcall.doAudio;
		}
		this.localTracks = {};
		this.remoteTracks = {};
    }

    _handleJanusError(error) {
        if (this.checkDevice) {
            Janus.log("check device");
            return;
        }
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.indexOf("android") > -1 || userAgent.indexOf("iphone") > -1) {
            console.error("Janus error, missing permission", error);
            return;
        }
        this.checkDevice = true;
        this.initializeModule();
    }

    _handleJanusDestroyed() {
        window.location.reload();
    }

    pushEventToSide = (callbackToOutSide) => {
        this.statusCallCurrent = (typeof callbackToOutSide.onmessageOutSide == "function") ? callbackToOutSide : () => { };

        callbackToOutSide.onmessageOutSide = (typeof callbackToOutSide.onmessageOutSide == "function") ? callbackToOutSide.onmessageOutSide : () => { };
        this.onmessageOutSide = callbackToOutSide.onmessageOutSide
    }

    hangUp() {
        Janus.log("Hanging up call");
        var hangup = { request: "hangup" };
		this.sipcall.send({ message: hangup });
        this.sipcall.hangup();
    }

    registerSip = async (ipSip, sip, secret) => {
        var sipserver = null;
        var username = null;
        var password = null;
        var register = null;
        this.ip = ipSip;
        sipserver = "sip:" + ipSip;
        username = "sip:" + sip + "@" + ipSip;
        password = secret;
        register = {
            request: "register",
            username: username
        };
        var authuser = sip;
        if (authuser !== "") {
            register.authuser = authuser;
        }
        var displayname = sip;
        if (displayname !== "") {
            register.display_name = displayname;
        }
        register["secret"] = password;
        register["proxy"] = sipserver;
        this.sipcall.send({ message: register });
    }
    isRegistered() { 
		return this.checkRegistered == EventSipGateway.Registered
	}

    call = async (phonenumber) => {
        if (this.isRegistered() == true) {
            // this.hangUp()
            var helperId = null;
            var handle = helperId ? helpers[helperId].sipcall : this.sipcall;
            var prefix = helperId ? ("[Helper #" + helperId + "]") : "";
            var suffix = helperId ? ("" + helperId) : "";
            var usernameAc = null;
            usernameAc = "sip:" + phonenumber + "@" + this.ip;
            handle.doAudio = true;
            let tracks = [{ type: 'audio', capture: true, recv: true }];

            handle.createOffer(
                {
                    tracks: tracks,
                    success: function (jsep) {
                        Janus.debug("Got SDP!", jsep);
                        var body = { request: "call", uri: usernameAc };
                        body["autoaccept_reinvites"] = false;
                        handle.send({ message: body, jsep: jsep });
                        return true;
                    },
                    error: function (error) {
                        Janus.error(prefix + "WebRTC error...", error);
                        let result = String(error).includes("Requested device not found");
                        if (result) {
                            this.checkDevice = false;
                        }
                        return false;
                    }
                });
        } else {
            Janus.log("You must be register SIP before call !!!")
            return false;
        }
    }

    reject = async() => {
        var body = { request: "decline" };
        this.sipcall.send({ message: body });
    }

    answer = async() => {
        var sipcallAction = (this.offerlessInvite ? this.sipcall.createOffer : this.sipcall.createAnswer);
        console.log(sipcallAction)
        let tracks = [];
        var sipcall = this.sipcall;
        if (this.doAudio){
            var doAudio = true;
            tracks.push({ type: 'audio', capture: true, recv: true });
            sipcallAction({
                jsep: this.dataJsep,
                tracks: tracks,
                success: function (dataJsep) {
                    Janus.debug("Got SDP " + dataJsep.type + "! audio="+ doAudio + ":", dataJsep);
                    sipcall.doAudio = doAudio;
                    var body = { request: "accept" };
                    body["autoaccept_reinvites"] = false;
                    sipcall.send({ message: body, jsep: dataJsep });
                },
                error: function (error) {
                    Janus.error("WebRTC error:", error);
                    var body = { request: "decline", code: 480 };
                    sipcall.send({ message: body });
                }
            });
        }
    }

    toggleHold = () => {
        if (this.checkHold != EventSipGateway.Holding) {
            var holdaction = { request: "hold", direction: "sendonly" };
            this.sipcall.send({ message: holdaction });
        } else {
            var unholdaction = { request: "unhold" };
            this.sipcall.send({ message: unholdaction });
        }
    }

    toggleMute = () => {
        let muted = this.sipcall.isAudioMuted();
        Janus.log((muted ? "Unmuting" : "Muting") + " local stream...");
        if (muted) {
            this.sipcall.unmuteAudio();
        } else {
            this.sipcall.muteAudio();
        }
        muted = this.sipcall.isAudioMuted();
    }

    transfer = (transferToNumber) => {
        var address = "sip:" + transferToNumber + "@" + this.ip;
        if (address === '') { return; }
        var msg = { request: "transfer", uri: address };
        this.sipcall.send({ message: msg });
        var sipcall = this.sipcall;
        setTimeout(function () {
            sipcall.hangup()
        }, 2000);
    }

    sendDtmf = (number) => {
        this.sipcall.dtmf({ dtmf: { tones: number } });
    }

    isMute = () => {
        return this.sipcall.isAudioMuted();
    }

    isHold = () => {
        return this.checkHold == EventSipGateway.Holding;
    }

    hasCheckDevice = () => {
        var checkDevice = this.checkDevice;
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                resolve(checkDevice);
            }, 500);
        });
    }

    release = () => {
        this.janus.destroy();
        this.server = "";
        this.iceServers = "";
        this.janus = "";
        this.sipcall = "";
        this.opaqueId = "";
        this.localTracks = {};
        this.remoteTracks = {};
        this.registered = false;
        this.helpers = {};
        this.helpersCount = 0;
        this.incoming = "";
        this.checkHold = "";
        this.ip = "";
        this.doAudio = "";
        this.dataJsep = "";
        this.offerlessInvite = "";
        this.checkRegistered = "";
        return;
    }

    //Actions call waiting by add new a session helper
    addHelperForCallWaiting = (sip) => {
        if(this.helpersCount == 0){
            this.helpersCount++;
            this.sipHandle = new Janus({
                server: this.server,
                success: () => {
                    // Attach to the SIP plugin
                    this.sipHandle.attach({
                        plugin: "janus.plugin.sip",
                        success: (pluginHandle) => {
                            this.sipcallHelper = pluginHandle;
                            this.sipcallHelper.send({
                                message: {
                                    request: "register",
                                    username: "sip:"+sip+"@"+this.ip,
                                    // secret: secret,
                                    // display_name: sip,
                                    type: "helper",
                                    master_id: this.master_id
                                },
                                success: (response) => {
                                    Janus.log("Helper session registered:", "success");
                                },
                                error: (error) => {
                                    Janus.error("Helper session registration failed:", error);
                                }
                            })
                        },
                        error: (error) => {
                            Janus.error("Helper session attach failed:", error);
                        },
                        onmessage: (msg, jsep) => this._handleOnMessageHelper(msg, jsep),
                        onlocaltrack: (track, on) => this._handleOnLocalTrackHelper(track, on),
                        onremotetrack: (track, mid, on) => this._handleOnRemoteTrackHelper(track, mid, on),
                        oncleanup: () => this._handleOnCleanupHelper()
                    })
                },
                error: (error) => {
                    Janus.error("SIP session attach failed:", error);
                },
                destroyed: () => {
                    Janus.log("SIP session destroyed");
                }
            })
        }
    }
    _handleOnMessageHelper(msg, jsep) {
        Janus.debug(" ::: Got a message :::", msg);
        const error = msg["error"];
        if (error) {
            if (this.registeredHelper) {
                this.sipcallHelper.hangup();
            }
            return;
        }
        const callId = msg["call_id"];
        const result = msg["result"];
        const dataCallback = {};
        let pushEvent = this.statusCallCurrent?.onmessageOutSide;
        if (result && result["event"]) {
            let event = result["event"];
            switch (event) {
                case EventSipGateway.RegistrationFailed:
                    this.checkRegisteredHelper = "";
                    event = EventSipGateway.RegistrationFailed;
                    Janus.warn("Registration helper failed: " + result["code"] + " " + result["reason"]);
                    break;
                case EventSipGateway.Registered:
                    event = EventSipGateway.Registered;
                    this._handleRegisteredHelper(result, jsep);
                    break;
                case EventSipGateway.Calling:
                    event === EventSipGateway.Calling
                    Janus.log("Waiting for the peer to answer...");
                    break;
                case EventSipGateway.Incomingcall:
                    this._handleIncomingCallHelper(result, jsep, callId, dataCallback);
                    return;
                case EventSipGateway.Accepting:
                    return;
                case EventSipGateway.Progress:
                    event = EventSipGateway.Progress;
                    this._handleProgressHelper(result, jsep);
                    break;
                case EventSipGateway.Accepted:
                    event = EventSipGateway.Accepted;
                    this._handleAcceptedHelper(result, jsep, callId);
                    break;
                case EventSipGateway.Transfer:
                    event = EventSipGateway.Transfer;
                    this._handleTransferHelper(result);
                    break;
                case EventSipGateway.Hangup:
                    this._handleHangupHelper(result);
                    return;
                case EventSipGateway.Holding:
                    this.checkHoldHelper = EventSipGateway.Holding;
                    event = EventSipGateway.Holding;
                    break;
                default:
                    this.checkHoldHelper = "";
                    event = EventSipGateway.Unholding;
            }
            pushEvent(event.toEventSipGateWay(), dataCallback);
        }
    }

    _handleRegisteredHelper(result, jsep) {
        this.checkRegisteredHelper = EventSipGateway.Registered;
        Janus.log("Successfully registered helper as " + result["username"] + "!");
        this.registeredHelper = true;
        // const div1 = document.createElement('div');
        // div1.innerHTML = `<div class="hide" id="audiostream"></div>`;
        // document.body.insertAdjacentElement('afterbegin', div1);
    }

    _handleIncomingCallHelper(result, jsep, callId, dataCallback) {
        Janus.log("Incoming call helper from " + result["username"] + "!");
        this.sipcallHelper.callId = callId;
        const parts = result["username"].split(":");
        const partsPhone = parts[1].split("@");
        const phoneNumber = partsPhone[0];
        this.doAudio = true;
        if (jsep) {
            this.doAudio = (jsep.sdp.indexOf("m=audio ") > -1);
            Janus.debug("Audio " + (this.doAudio ? "has" : "has NOT") + " been negotiated");
        } else {
            Janus.log("This call doesn't contain an offer... we'll need to provide one ourselves");
            this.offerlessInvite = true;
        }
        let transfer = "";
        const referredBy = result["referred_by"];
        if (referredBy) {
            transfer = " (referred by " + referredBy + ")";
            transfer = transfer.replace(new RegExp('<', 'g'), '&lt');
            transfer = transfer.replace(new RegExp('>', 'g'), '&gt');
        }
        let rtpType = "";
        const srtp = result["srtp"];
        if (srtp === "sdes_optional")
            rtpType = " (SDES-SRTP offered)";
        else if (srtp === "sdes_mandatory")
            rtpType = " (SDES-SRTP mandatory)";
        let extra = "";
        if (this.offerlessInvite) {
            extra = " (no SDP offer provided)";
        }
        this.dataJsepHelper = jsep;
        // dataCallback = { 'phonenumber': phoneNumber }
        let pushEvent = this.statusCallCurrent?.onmessageOutSide;
        dataCallback.phonenumberHelper = phoneNumber;
        const event = EventSipGateway.Incomingcall;
        if (pushEvent) {
            pushEvent(event.toEventSipGateWay(), dataCallback);
        }
    }

    _handleProgressHelper(result, jsep) {
        Janus.log("There's early media from " + result["username"] + ", waiting for the call!", jsep);
        if (jsep) {
            this.sipcallHelper.handleRemoteJsep({
                jsep: jsep,
                error: () => {
                    const hangup = { request: "hangup" };
                    this.sipcallHelper.send({ message: hangup });
                    this.sipcallHelper.hangup();
                }
            });
        }
    }

    _handleAcceptedHelper(result, jsep, callId) {
        this.sipcallHelper.callId = callId;
        Janus.log(result["username"] + " accepted the call!", jsep);
        if (jsep) {
            this.sipcallHelper.handleRemoteJsep({
                jsep: jsep,
                error: () => {
                    const hangup = { request: "hangup" };
                    this.sipcallHelper.send({ message: hangup });
                    this.sipcallHelper.hangup();
                }
            });
        }
    }

    _handleTransferHelper(result) {
        Janus.log(result["username"] + " is being transferred!", result);
    }

    _handleHangupHelper(result) {
        Janus.log("Call hung up (" + result["code"] + " " + result["reason"] + ")!");
        this.dataJsepHelper = "";
        this.sipcallHelper.hangup();
        this.sipcallHelper.callId = null;
        this.doAudio = true;
        this.offerlessInvite = false;
        const dataCallback = {};
        let event = EventSipGateway.Hangup;
        const reasonHangup = result["reason"];
        switch (reasonHangup) {
            case EventHangup.BusyHere:
                event = EventSipGateway.Reject;
                dataCallback.message = reasonHangup;
                break;
            case EventHangup.ToBye:
                event = EventSipGateway.EmployerHangup;
                break;
            case EventHangup.SessionTerminated:
                event = EventSipGateway.CustomerHangup;
                break;
            case EventHangup.RequestTerminated:
                event = EventSipGateway.Missed;
                break;
            default:
                event = EventSipGateway.Hangup;
        }
        let pushEvent = this.statusCallCurrent?.onmessageOutSide;
        if (pushEvent) {
            pushEvent(event.toEventSipGateWay(), dataCallback);
        }
    }

    _handleOnLocalTrackHelper(track, on) {
        Janus.debug("Local track " + (on ? "added" : "removed") + ":", track);
		var trackId = track.id.replace(/[{}]/g, "");
		if(!on) {
			// Track removed, get rid of the stream and the rendering
			var stream = this.localTracks[trackId];
			if(stream) {
				try {
					var tracks = stream.getTracks();
					for(var i in tracks) {
						var mst = tracks[i];
						if(mst)
							mst.stop();
					}
				} catch(e) {}
			}
			delete this.localTracks[trackId];
			return;
		}
		// If we're here, a new track was added
		var stream = this.localTracks[trackId];
		if(stream) {
			// We've been here already
			return;
		}
		if(track.kind === "audio") {
			// We ignore local audio tracks, they'd generate echo anyway
		} else {
			// New video track: create a stream out of it
		}
		if(this.sipcallHelper.webrtcStuff.pc.iceConnectionState !== "completed" &&
				this.sipcallHelper.webrtcStuff.pc.iceConnectionState !== "connected") {
		}
    }

    _handleOnRemoteTrackHelper(track, mid, on) {
        Janus.debug("Remote track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
		if(!on) {
			// Track removed, get rid of the stream and the rendering
			$('#peervideom' + mid).remove();
			delete this.remoteTracks[mid];
			return;
		}
		// If we're here, a new track was added
		if(track.kind === "audio") {
			// New audio track: create a stream out of it, and use a hidden <audio> element
			const stream = new MediaStream([track]);
			this.remoteTracks[mid] = stream;
			Janus.log("Created remote audio stream:", stream);
			$('#audiostream').append('<audio class="hide" id="peervideom' + mid + '" autoplay playsinline/>');
			Janus.attachMediaStream($('#peervideom' + mid).get(0), stream);
		}
    }

    _handleOnCleanupHelper() {
        Janus.log(" ::: Got a cleanup notification :::");
		$('#audiostream').empty();
		if(this.sipcallHelper) {
			delete this.sipcallHelper.callId;
			delete this.sipcallHelper.doAudio;
		}
		this.localTracks = {};
		this.remoteTracks = {};
    }

    _handleJanusErrorHelper(error) {
        if (this.checkDevice) {
            Janus.log("check device");
            return;
        }
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.indexOf("android") > -1 || userAgent.indexOf("iphone") > -1) {
            console.error("Janus error, missing permission", error);
            return;
        }
        this.checkDevice = true;
        // this.initializeModule();
    }

    _handleJanusDestroyedHelper() {
        window.location.reload();
    }

    hangUpHelper() {
        Janus.log("Hanging up call");
        this.sipcallHelper.hangup();
    }
   
    isRegisteredHelper() { 
		return this.checkRegistered == EventSipGateway.Registered
	}


    rejectHelper = async() => {
        var body = { request: "decline" };
        this.sipcallHelper.send({ message: body });
    }

    answerHelper = async() => {
        var sipcallAction = (this.offerlessInvite ? this.sipcallHelper.createOffer : this.sipcallHelper.createAnswer);
        let tracks = [];
        var sipcall = this.sipcallHelper;
        if (this.doAudio){
            var doAudio = true;
            tracks.push({ type: 'audio', capture: true, recv: true });
            sipcallAction({
                jsep: this.dataJsepHelper,
                tracks: tracks,
                success: function (dataJsepHelper) {
                    Janus.debug("Got SDP " + dataJsepHelper.type + "! audio="+ doAudio + ":", dataJsepHelper);
                    sipcall.doAudio = doAudio;
                    var body = { request: "accept" };
                    body["autoaccept_reinvites"] = false;
                    sipcall.send({ message: body, jsep: dataJsepHelper });
                },
                error: function (error) {
                    Janus.error("WebRTC error:", error);
                    var body = { request: "decline", code: 480 };
                    sipcall.send({ message: body });
                }
            });
        }
    }

    toggleHoldHelper = () => {
        if (this.checkHoldHelper != EventSipGateway.Holding) {
            var holdaction = { request: "hold", direction: "sendonly" };
            this.sipcallHelper.send({ message: holdaction });
        } else {
            var unholdaction = { request: "unhold" };
            this.sipcallHelper.send({ message: unholdaction });
        }
    }

    toggleMuteHelper = () => {
        let muted = this.sipcallHelper.isAudioMuted();
        Janus.log((muted ? "Unmuting" : "Muting") + " local stream...");
        if (muted) {
            this.sipcallHelper.unmuteAudio();
        } else {
            this.sipcallHelper.muteAudio();
        }
        muted = this.sipcallHelper.isAudioMuted();
    }

    transferHelper = (transferToNumber) => {
        var address = "sip:" + transferToNumber + "@" + this.ip;
        if (address === '') { return; }
        var msg = { request: "transfer", uri: address };
        this.sipcallHelper.send({ message: msg });
        var sipcall = this.sipcallHelper;
        setTimeout(function () {
            sipcall.hangup()
        }, 2000);
    }

    sendDtmfHelper = (number) => {
        this.sipcallHelper.dtmf({ dtmf: { tones: number } });
    }

    isMuteHelper = () => {
        return this.sipcallHelper.isAudioMuted();
    }

    isHoldHelper = () => {
        return this.checkHoldHelper == EventSipGateway.Holding;
    }
    releaseSessionHelper = () => {
        this.sipHandle.destroy();
    }
}

export { Voip24hModule, EventSipGateway };
