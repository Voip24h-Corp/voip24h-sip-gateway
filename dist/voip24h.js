import Janus from './janus.es'
//Process in call
var server = null;
const rndInt = Math.floor(Math.random() * 100) + 1;
if (rndInt % 2 == 0){
	server = "https://janus.voip24h.vn/janus";
}
else{
	server = "https://janus2.voip24h.vn/janus";
}
var iceServers = null;
var janus = null;
var sipcall = null;
var opaqueId = "siptest-" + Janus.randomString(12);
var test_tien = 123
var localTracks = {}, remoteTracks = {};
var registered = false;
var helpers = {}, helpersCount = 0;
var incoming = null;
var checkHold = null;
var ip;
var doAudio = true;
var dataJsep;
var offerlessInvite = false;
var checkRegistered;
var checkReject;
var checkDevice = true;
var referId;
var statusCallCurrent = null;

function Voip24h(callbackToOutSide){
	statusCallCurrent =(typeof callbackToOutSide.onmessageOutSide == "function") ? callbackToOutSide : () => { };
	
	callbackToOutSide.onmessageOutSide = (typeof callbackToOutSide.onmessageOutSide == "function") ? callbackToOutSide.onmessageOutSide : () => { };
	this.onmessageOutSide = callbackToOutSide.onmessageOutSide
}

// Voip24h.StatusToOutSide = function (callbackToOutSide) {
// 	statusCallCurrent =(typeof callbackToOutSide.onmessageOutSide == "function") ? callbackToOutSide : () => { };
	
// 	callbackToOutSide.onmessageOutSide = (typeof callbackToOutSide.onmessageOutSide == "function") ? callbackToOutSide.onmessageOutSide : () => { };
// 	this.onmessageOutSide = callbackToOutSide.onmessageOutSide
	
// }

Voip24h.initGateWay = function(){
	Janus.init({
		debug: "all", callback: function () {
			if (!Janus.isWebrtcSupported()) {
				return;
			}
			let iOS = ['iPad', 'iPhone', 'iPod'].indexOf(navigator.platform) >= 0;
			let eventName = iOS ? 'pagehide' : 'beforeunload';
			let oldOBF = window["on" + eventName];
			window.addEventListener(eventName, function () {
				for (let s in Janus.sessions) {
					if (Janus.sessions[s] && Janus.sessions[s].destroyOnUnload) {
						Janus.log("Destroying session " + s);
						Janus.sessions[s].destroy({ unload: true, notifyDestroyed: false });
					}
				}
				if (oldOBF && typeof oldOBF == "function") {
					oldOBF();
				}
			});
			// Create session
			janus = new Janus(
				{
					server: server,
					iceServers: iceServers,
					success: function () {
						// Attach to SIP plugin
						janus.attach(
							{
								plugin: "janus.plugin.sip",
								opaqueId: opaqueId,
								success: function (pluginHandle) {
									sipcall = pluginHandle;

									Janus.log("Plugin attached! (" + sipcall.getPlugin() + ", id=" + sipcall.getId() + ")");
								},
								error: function (error) {
									Janus.error("  -- Error attaching plugin...", error);
								},
								consentDialog: function (on) {
									Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
								},
								iceState: function (state) {
									Janus.log("ICE state changed to " + state);
								},
								mediaState: function (medium, on, mid) {
									Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium + " (mid=" + mid + ")");
								},
								webrtcState: function (on) {
									Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
								},
								slowLink: function (uplink, lost, mid) {
									Janus.warn("Janus reports problems " + (uplink ? "sending" : "receiving") +
										" packets on mid " + mid + " (" + lost + " lost packets)");
								},
								onmessage: function (msg, jsep) {
									Janus.debug(" ::: Got a message :::", msg);
									var error = msg["error"];
									if (error) {
										if (registered) {
											// Reset status
											sipcall.hangup();
										}
										return;
									}
									var callId = msg["call_id"];
									var result = msg["result"];
									if (result && result["event"]) {
										var event = result["event"];
										let pushEvent =	statusCallCurrent?.onmessageOutSide;
										if(pushEvent){
											if(event !== 'incomingcall' && event !== 'hangup' && event !== 'holding'){
												pushEvent(result["event"]);
											}
										} 
										if (event === 'registration_failed') {
											checkRegistered = "";
											Janus.warn("Registration failed: " + result["code"] + " " + result["reason"]);
											return;
										}
										if (event === 'registered') {
											checkRegistered = "registered";
											Janus.log("Successfully registered as " + result["username"] + "!");
											registered = true;
											const div1 = document.createElement('div');
											div1.innerHTML = `<div class="hide" id="audiostream"></div>`;
											document.body.insertAdjacentElement('afterbegin', div1);
										} else if (event === 'calling') {
											Janus.log("Waiting for the peer to answer...");
											// TODO Any ringtone?
										} else if (event === 'incomingcall') {
											Janus.log("Incoming call from " + result["username"] + "!");
											sipcall.callId = callId;
											var parts = result["username"].split(":");
											var partsPhone = parts[1].split("@");
											var phoneNumber = partsPhone[0];
											doAudio = true
											if (jsep) {
												doAudio = (jsep.sdp.indexOf("m=audio ") > -1);
												Janus.debug("Audio " + (doAudio ? "has" : "has NOT") + " been negotiated");
											} else {
												Janus.log("This call doesn't contain an offer... we'll need to provide one ourselves");
												offerlessInvite = true;
											}
											var transfer = "";
											var referredBy = result["referred_by"];
											if (referredBy) {
												transfer = " (referred by " + referredBy + ")";
												transfer = transfer.replace(new RegExp('<', 'g'), '&lt');
												transfer = transfer.replace(new RegExp('>', 'g'), '&gt');
											}
											var rtpType = "";
											var srtp = result["srtp"];
											if (srtp === "sdes_optional")
												rtpType = " (SDES-SRTP offered)";
											else if (srtp === "sdes_mandatory")
												rtpType = " (SDES-SRTP mandatory)";
											var extra = "";
											if (offerlessInvite) {
												extra = " (no SDP offer provided)"
											}
											dataJsep = jsep;
											incoming = [{ 'phonenumber': phoneNumber }, { 'callid': callId }];
											pushEvent([event,{ 'phonenumber': phoneNumber }]);

										} else if (event === 'accepting') {
											// Response to an offerless INVITE, let's wait for an 'accepted'
										} else if (event === 'progress') {
											Janus.log("There's early media from " + result["username"] + ", wairing for the call!", jsep);
											// Call can start already: handle the remote answer
											if (jsep) {
												sipcall.handleRemoteJsep({ jsep: jsep, error: () => {
													var hangup = { request: "hangup" };
													sipcall.send({ message: hangup });
													sipcall.hangup();
												}});
											}
										} else if (event === 'accepted') {
											Janus.log(result["username"] + " accepted the call!", jsep);
											// Call can start, now: handle the remote answer
											if (jsep) {
												sipcall.handleRemoteJsep({ jsep: jsep, error: () => {
													var hangup = { request: "hangup" };
													sipcall.send({ message: hangup });
													sipcall.hangup();
												}});
											}
											sipcall.callId = callId;
										} else if (event === 'transfer') {
											//Event transfer
											var referTo = result["refer_to"];
											var referredBy = result["referred_by"] ? result["referred_by"] : "an unknown party";
											referId = result["refer_id"];
											var replaces = result["replaces"];
											var extra = ("referred by " + referredBy);
											if (replaces)
												extra += (", replaces call-ID " + replaces);
											extra = extra.replace(new RegExp('<', 'g'), '&lt');
											extra = extra.replace(new RegExp('>', 'g'), '&gt');

										} else if (event === 'hangup') {
											Janus.log("Call hang up (" + result["code"] + " " + result["reason"] + ")!");

											if (result["reason"] == "Busy Here") {
												pushEvent('reject');
											} else if (result["reason"] == "to BYE") {
												pushEvent('employer_hangup');
											} else if (result["reason"] == "Session Terminated") {
												pushEvent('customer_hangup');
											} else {
												pushEvent(event);
											}
											// Reset status
											sipcall.hangup();
										}
										if (event === 'holding') {
											checkHold = "holding";
											pushEvent(event);
										} else {
											checkHold = "";
											pushEvent("unholding");
										}
									}
								},
								onlocaltrack: function (track, on) {
									Janus.debug("Local track " + (on ? "added" : "removed") + ":", track);
									var trackId = track.id.replace(/[{}]/g, "");
									if (!on) {
										// Track removed, get rid of the stream and the rendering
										var stream = localTracks[trackId];
										if (stream) {
											try {
												var tracks = stream.getTracks();
												for (var i in tracks) {
													var mst = tracks[i];
													if (mst)
														mst.stop();
												}
											} catch (e) { }
										}
										delete localTracks[trackId];
										return;
									}
									// If we're here, a new track was added
									var stream = localTracks[trackId];
									if (stream) {
										// We've been here already
										return;
									}
									if (track.kind === "audio") {
										// We ignore local audio tracks, they'd generate echo anyway
									} else {
										// New video track: create a stream out of it
									}
									if (sipcall.webrtcStuff.pc.iceConnectionState !== "completed" &&
										sipcall.webrtcStuff.pc.iceConnectionState !== "connected") {
									}
								},
								onremotetrack: function (track, mid, on) {
									Janus.debug("Remote track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
									if (!on) {
										// Track removed, get rid of the stream and the rendering
										$('#peervideom' + mid).remove();
										delete remoteTracks[mid];
										return;
									}
									// If we're here, a new track was added
									if (track.kind === "audio") {
										// New audio track: create a stream out of it, and use a hidden <audio> element
										var stream = new MediaStream([track]);
										remoteTracks[mid] = stream;
										Janus.log("Created remote audio stream:", stream);
										$('#audiostream').append('<audio class="hide" id="peervideom' + mid + '" autoplay playsinline/>');
										Janus.attachMediaStream($('#peervideom' + mid).get(0), stream);
									}
								},
								oncleanup: function () {
									Janus.log(" ::: Got a cleanup notification :::");
									$('#audiostream').empty();
									if (sipcall) {
										delete sipcall.callId;
										delete sipcall.doAudio;
									}
									localTracks = {};
									remoteTracks = {};
								}
							});
					},
					error: function (error) {
						Janus.error(error);
						let pushEventError = statusCallCurrent?.onmessageOutSide;
						if (error == "Lost connection to the server (is it down?)") {
							pushEventError(['error', "server_down"]);
						}
					},
					destroyed: function () {
						let pushEventDestroyed = statusCallCurrent?.onmessageOutSide;
						window.addEventListener('beforeunload', function (event) {
							// Close the peer connection
							peer.close();
							pushEventDestroyed(['closing', true]);
						});
						pushEventDestroyed('destroyed');
					}
				});

		}
	});
}


Voip24h.registerSip = async (ipSip, sip, secret) => {
	var port = 5060;
	var sipserver = null;
	var username = null;
	var password = null;
	var register = null;
	ip = ipSip;
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
	sipcall.send({ message: register });
}

Voip24h.call = async (phonenumber) => {
	if (Voip24h.isRegistered() == true) {
		var helperId = null;
		var handle = helperId ? helpers[helperId].sipcall : sipcall;
		var prefix = helperId ? ("[Helper #" + helperId + "]") : "";
		var suffix = helperId ? ("" + helperId) : "";
		var usernameAc = null;
		usernameAc = "sip:" + phonenumber + "@" + ip;
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
				},
				error: function (error) {
					Janus.error(prefix + "WebRTC error...", error);
					let result = String(error).includes("Requested device not found");
					if (result) {
						checkDevice = false;
					}

				}
			});
	} else {
		console.log("You must be register SIP before call !!!")
		return false;
	}
}

Voip24h.hangUp = () => {
	var helperId = null;
	if (!helperId) {
		var hangup = { request: "hangup" };
		sipcall.send({ message: hangup });
		sipcall.hangup();
	} else {
		var hangup = { request: "hangup" };
		helpers[helperId].sipcall.send({ message: hangup });
		helpers[helperId].sipcall.hangup();
	}
}
function hangUp2(){
	var helperId = null;
	if (!helperId) {
		var hangup = { request: "hangup" };
		sipcall.send({ message: hangup });
		sipcall.hangup();
	} else {
		var hangup = { request: "hangup" };
		helpers[helperId].sipcall.send({ message: hangup });
		helpers[helperId].sipcall.hangup();
	}
}

Voip24h.reject = () => {
	var body = { request: "decline", refer_id: referId };
	sipcall.send({ message: body });
}

Voip24h.answer = () => {
	incoming = null;
	var sipcallAction = (offerlessInvite ? sipcall.createOffer : sipcall.createAnswer);
	let tracks = [];
	if (doAudio)
		tracks.push({ type: 'audio', capture: true, recv: true });
	console.log(dataJsep);
	sipcallAction(
		{
			jsep: dataJsep,
			tracks: tracks,
			success: function (dataJsep) {
				Janus.debug("Got SDP " + dataJsep.type + "! audio=" + doAudio + ":", dataJsep);
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
};

Voip24h.toggleHold = () => {
	if (checkHold != "holding") {
		var holdaction = { request: "hold", direction: "sendonly" };
		sipcall.send({ message: holdaction });
	} else {
		var unholdaction = { request: "unhold" };
		sipcall.send({ message: unholdaction });
	}
}

Voip24h.toggleMute = () => {
	let muted = sipcall.isAudioMuted();
	Janus.log((muted ? "Unmuting" : "Muting") + " local stream...");
	if (muted) {
		sipcall.unmuteAudio();
	} else {
		sipcall.muteAudio();
	}
	muted = sipcall.isAudioMuted();
}

Voip24h.transfer = (transferToNumber) => {
	var address = "sip:" + transferToNumber + "@" + ip;
	console.log(address);
	if (address === '') { return; }
	var msg = { request: "transfer", uri: address };
	sipcall.send({ message: msg });
	setTimeout(function () {
		hangUp();
	}, 2000);
}

Voip24h.sendDtmfToSip = (number) => {
	sipcall.dtmf({ dtmf: { tones: number } });
}

Voip24h.isMute = () => {
	return sipcall.isAudioMuted();
}

Voip24h.isHold = () => {
	return checkHold == "holding"
}

Voip24h.isRegistered = () => {
	return checkRegistered == "registered"
}

Voip24h.hasCheckDevice = () => {
	return new Promise(function (resolve, reject) {
		setTimeout(function () {
			resolve(checkDevice);
		}, 500);
	});
}

Voip24h.release = () => {
	janus.destroy();
	server = "";
	iceServers = "";
	janus = "";
	sipcall = "";
	opaqueId = "";
	localTracks = {};
	remoteTracks = {};
	registered = false;
	helpers = {};
	helpersCount = 0;
	incoming = "";
	checkHold = "";
	ip = "";
	doAudio = "";
	dataJsep = "";
	offerlessInvite = "";
	checkRegistered = "";
	test_tien = 123;
	return;
}

export { Voip24h as default };