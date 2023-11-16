const EventSipGateway = {
    Incomingcall: 'incomingcall',
    RegistrationFailed: 'registration_failed',
    Registered: 'registered',
    Calling: 'calling',
    Accepting: 'accepting',
    Progress: 'progress',
    Accepted: 'accepted',
    Transfer: 'transfer',
    Hangup: 'hangup',
    Reject: 'reject',
    EmployerHangup: 'employer_hangup',
    CustomerHangup: 'customer_hangup',
    Holding: 'holding',
    Unholding: 'unholding',
    Error: 'error',
    Destroyed: 'destroyed',
    ServerDown: 'server_down',
    Closing: 'closing'
}

String.prototype.toEventSipGateWay = function() {
    return Object.values(EventSipGateway).find((value) => value === this)
}

export { EventSipGateway }