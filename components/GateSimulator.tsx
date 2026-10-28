import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import styles from "./GateSimulator.module.css";

type Log = { time:string; level:"info"|"ok"|"warn"|"error"; text:string };

const now=()=>new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
const makeEventId=()=>crypto.randomUUID();

type GateSimulatorProps = {
  defaultDeviceCode?: string;
  defaultDeviceSecret?: string;
};

export function GateSimulator({
  defaultDeviceCode = "GATE-IN-001",
  defaultDeviceSecret = "",
}: GateSimulatorProps = {}) {
  const [deviceCode,setDeviceCode]=useState(defaultDeviceCode);
  const [deviceSecret,setDeviceSecret]=useState(defaultDeviceSecret);
  const [vehicleType,setVehicleType]=useState<"Mobil"|"Motor">("Mobil");
  const [running,setRunning]=useState(false);
  const [vehiclePresent,setVehiclePresent]=useState(false);
  const [logs,setLogs]=useState<Log[]>([]);
  const [ticket,setTicket]=useState<{ticketNo:string;slot:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [lastEventId,setLastEventId]=useState<string|null>(null);
  const timer=useRef<number|null>(null);

  const addLog=(level:Log["level"],text:string)=>setLogs(prev=>[{time:now(),level,text},...prev].slice(0,60));
  const headers=()=>({"Content-Type":"application/json","x-device-code":deviceCode.trim(),"x-device-secret":deviceSecret.trim()});

  const call=(path:string,body:any)=>{
    return fetch(path,{method:"POST",headers:headers(),body:JSON.stringify(body)}).then(async r=>{
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||"Request gagal");
      return j;
    });
  };

  const heartbeat=async()=>{
    if(!deviceSecret.trim())return;
    try{
      await fetch("/_api/parking/deviceHeartbeat",{method:"POST",headers:headers(),body:JSON.stringify({
        status:"idle",firmwareVersion:"SIM-GATE-1.0",ipAddress:"SIMULATOR",
        health:{sensor:"ok",camera:"ok",printer:"ok",barrier:"ok"}
      })});
    }catch(e){addLog("warn","Heartbeat gagal: "+(e instanceof Error?e.message:"error"));}
  };

  useEffect(()=>{
    if(!running){ if(timer.current)window.clearInterval(timer.current); timer.current=null; return; }
    heartbeat();
    timer.current=window.setInterval(heartbeat,15000);
    return()=>{if(timer.current)window.clearInterval(timer.current);timer.current=null;};
  },[running,deviceCode,deviceSecret]);

  const fetchCommands=async()=>{
    const r=await fetch("/_api/parking/deviceCommands?limit=10",{headers:{"x-device-code":deviceCode.trim(),"x-device-secret":deviceSecret.trim()}});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||"Gagal mengambil command");
    return j.commands||[];
  };

  const ack=async(commandId:string,status:"acknowledged"|"completed"|"failed",errorMessage?:string)=>{
    return call("/_api/parking/deviceCommandAck",{commandId,status,...(errorMessage?{errorMessage}:{})});
  };

  const processCommands=async()=>{
    if(!deviceSecret.trim())return;
    try{
      const commands=await fetchCommands();
      for(const command of commands){
        addLog("info",`Command diterima: ${command.commandType} · ${command.payload?.ticketNo||command.id}`);
        await ack(command.id,"acknowledged");
        await new Promise(r=>window.setTimeout(r,500));
        if(command.commandType==="camera_snapshot"){
          addLog("ok","Kamera: snapshot simulasi berhasil.");
          await ack(command.id,"completed");
        }else if(command.commandType==="printer_print"){
          addLog("ok",`Printer: tiket ${command.payload?.ticketNo||"—"} dianggap tercetak.`);
          await ack(command.id,"completed");
        }else if(command.commandType==="barrier_open"){
          addLog("ok","Barrier: perintah buka dianggap berhasil.");
          await ack(command.id,"completed");
        }else{
          await ack(command.id,"failed","Command type tidak didukung simulator");
          addLog("error","Command tidak didukung: "+command.commandType);
        }
      }
    }catch(e){addLog("error",e instanceof Error?e.message:"Gagal memproses command");}
  };

  useEffect(()=>{
    if(!running)return;
    processCommands();
    const id=window.setInterval(processCommands,2000);
    return()=>window.clearInterval(id);
  },[running,deviceCode,deviceSecret]);

  const start=()=>{
    if(!deviceCode.trim()||!deviceSecret.trim()){addLog("error","Isi Device Code dan Secret terlebih dahulu.");return;}
    setRunning(true); addLog("ok","Simulator Gate In aktif.");
  };
  const stop=()=>{setRunning(false);addLog("warn","Simulator dihentikan.");};

  const triggerVehicle=()=>{setVehiclePresent(true);setTicket(null);addLog("info","Sensor: kendaraan terdeteksi.");};
  const issueTicket=async()=>{
    if(!vehiclePresent||busy)return;
    setBusy(true);
    const eventId=makeEventId();
    addLog("info","Tombol AMBIL TIKET ditekan · eventId baru dibuat.");
    try{
      const j=await call("/_api/parking/gateSelfService",{vehicleType,eventId});
      setLastEventId(eventId);
      setTicket({ticketNo:j.ticketNo,slot:j.slot});
      setVehiclePresent(false);
      addLog(j.idempotent?"warn":"ok",`Tiket ${j.ticketNo} · slot ${j.slot} · command queue dibuat.`);
    }catch(e){addLog("error",e instanceof Error?e.message:"Gagal menerbitkan tiket");}
    finally{setBusy(false);}
  };
  const retrySameEvent=async()=>{
    if(!lastEventId||busy||!running)return;
    setBusy(true);
    addLog("info","Retry event terakhir dikirim dengan eventId yang sama.");
    try{
      const j=await call("/_api/parking/gateSelfService",{vehicleType,eventId:lastEventId});
      setTicket({ticketNo:j.ticketNo,slot:j.slot});
      addLog(j.idempotent?"ok":"warn",j.idempotent?`Idempotency OK · tiket ${j.ticketNo} dikembalikan tanpa membuat sesi baru.`:`Backend merespons tanpa flag idempotent · tiket ${j.ticketNo}.`);
    }catch(e){addLog("error",e instanceof Error?e.message:"Retry gagal");}
    finally{setBusy(false);}
  };
  const status=useMemo(()=>running?"ONLINE":"STOPPED",[running]);

  return <section className={styles.wrap}>
    <div className={styles.head}><div><h2>Simulasi Gate In</h2><p>Menjalankan perangkat virtual menggunakan API dan command queue yang sama dengan ESP32.</p></div><Badge variant={running?"success":"outline"}>{status}</Badge></div>
    <div className={styles.grid}>
      <div className={styles.panel}>
        <h3>1 · Hubungkan perangkat virtual</h3>
        <label>Device Code<input value={deviceCode} onChange={e=>setDeviceCode(e.target.value.toUpperCase())} disabled={running}/></label>
        <label>Device Secret<input type="password" value={deviceSecret} onChange={e=>setDeviceSecret(e.target.value)} disabled={running} placeholder="Secret dari Buat kredensial"/></label>
        <div className={styles.actions}><Button onClick={start} disabled={running}>Mulai simulator</Button><Button variant="outline" onClick={stop} disabled={!running}>Hentikan</Button></div>
      </div>
      <div className={styles.panel}>
        <h3>2 · Skenario kendaraan</h3>
        <div className={styles.state}><span>Sensor kendaraan</span><strong>{vehiclePresent?"TERDETEKSI":"KOSONG"}</strong></div>
        <label>Jenis kendaraan<select value={vehicleType} onChange={e=>setVehicleType(e.target.value as "Mobil"|"Motor")}><option>Mobil</option><option>Motor</option></select></label>
        <div className={styles.actions}><Button variant="outline" onClick={triggerVehicle} disabled={!running||vehiclePresent}>Simulasikan kendaraan</Button><Button onClick={issueTicket} disabled={!running||!vehiclePresent||busy}>{busy?"Memproses…":"AMBIL TIKET"}</Button></div>
        {ticket&&<div className={styles.ticket}><span>Tiket terakhir</span><strong>{ticket.ticketNo}</strong><small>Slot {ticket.slot}</small><small>Event {lastEventId}</small><Button variant="outline" onClick={retrySameEvent} disabled={!running||!lastEventId||busy}>Ulangi event terakhir</Button></div>}
      </div>
    </div>
    <div className={styles.panel}>
      <div className={styles.logHead}><h3>3 · Event & command log</h3><Button variant="outline" onClick={()=>setLogs([])}>Bersihkan</Button></div>
      <div className={styles.log} aria-live="polite">{logs.length?logs.map((l,i)=><div key={i} className={styles.row}><time>{l.time}</time><b data-level={l.level}>{l.level.toUpperCase()}</b><span>{l.text}</span></div>):<div className={styles.empty}>Belum ada event.</div>}</div>
    </div>
  </section>;
}
