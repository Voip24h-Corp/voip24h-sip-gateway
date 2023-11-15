const EventSipGateway = {
    Incomingcall: 'incomingcall',
    Registration_failed: 'registration_failed',
    Registered: 'registered',
    Calling: 'calling',
    Accepting: 'accepting',
    Progress: 'progress',
    Accepted: 'accepted',
    Transfer: 'transfer',
    Hangup: 'hangup',
    Reject: 'reject',
    Employer_hangup: 'employer_hangup',
    Customer_hangup: 'customer_hangup',
    Holding: 'holding',
    Unholding: 'unholding',
    Error: 'error',
    Destroyed: 'destroyed',
    Server_down: 'server_down',
    Closing: 'closing'
}

String.prototype.toEventSipGateWay = function() {
    return Object.values(EventSipGateway).find((value) => value === this)
}

export { EventSipGateway }