import logo from './logo.svg';
import './App.css';
import { Voip24hModule, EventSipGateway } from 'voip24h-sip-gateway';
import { useEffect, useState } from 'react';


const debug = "all";
const module = Voip24hModule.getInstance(debug);
await module.initializeModule();

function App() {
  const [phoneNumber, setPhoneNumber] = useState("");
  useEffect(() => {
    module.pushEventToSide(
      {
        onmessageOutSide: function (event, data) {
          console.log(event)
          console.log("Trạng thái: " + event);
          if(event === EventSipGateway.Incomingcall){
            console.log("Số người gọi đến: " + data.phonenumber);
          }
        }
      }
    );
    module.registerSip("ip_pbx", "sip_number", "password")
  }, []);

  const handlePhoneNumber = (e) => {
    setPhoneNumber(e.target.value);
    console.log(e.target.value)
  }

  return (
    <div className="App">
      <header className="App-header">
        <p>
          Test Page Voip24h Sip Gateway
        </p>
        {/* <button onClick={() => module.initGateWay()}>Init service</button> */}
        <button onClick={() => module.registerSip("IP_PBX", "SIP", "PASSWORD")}>Register</button>
        <input onChange={e=>handlePhoneNumber(e)}></input>
          <button onClick={() => module.call(phoneNumber)}>Call</button>
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
