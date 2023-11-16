import logo from './logo.svg';
import './App.css';
import { Voip24hModule, EventSipGateway } from 'voip24h-sip-gateway';
import { useEffect } from 'react';


function App() {
  var module = Voip24hModule.getInstance()
  useEffect(() => {
    module.pushEventToSide(
      {
        onmessageOutSide: function (event,data) {
          console.log("Trạng thái: " + event);
          if(event === EventSipGateway.Incomingcall){
            console.log("Số người gọi đến: " + data.phonenumber);
          }
        }
      }
    );
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <p>
          Test Page Voip24h Sip Gateway
        </p>
        {/* <button onClick={() => module.initGateWay()}>Init service</button> */}
        <button onClick={() => module.registerSip("IP_PBX", "SIP", "PASSWORD")}>Register</button>
        <button onClick={() => module.call("PHONENUMBER")}>Call</button>
        <button onClick={() => module.hangUp()}>Hang Up</button>
        <button onClick={() => module.answer()}>Answer</button>
        <button onClick={() => module.reject()}>Reject</button>
        <button onClick={() => module.toggleHold()}>Hold</button>
        <button onClick={() => module.toggleMute()}>Mute</button>
        <button onClick={() => module.transfer()}>Transfer</button>
        <button onClick={() => module.sendDtmf(2)}>sendDtmf</button>
      </header>
    </div>
  );
}

export default App;
