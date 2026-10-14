import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Power, Radio, Video } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Input } from "./Input";
import { useAuth } from "../helpers/useAuth";
import { getParkingDevices, type OutputType } from "../endpoints/parking/devices_GET.schema";
import { postParkingDevice } from "../endpoints/parking/devices_POST.schema";
import { postParkingDeviceProvision } from "../endpoints/parking/deviceProvision_POST.schema";
import styles from "./DeviceManagement.module.css";

type Device = OutputType[number];
type Form = { id?: string; deviceCode: string; name: string; deviceType: "gate"|"cashier"|"controller"|"camera"|"printer"|"sensor"; status: "active"|"inactive"|"maintenance"; area: string; gateDirection: "in"|"out"|""; cameraUrl: string; cameraSnapshotUrl: string; cameraDeviceCode: string; printerDeviceCode: string };

const emptyForm: Form = { deviceCode:"", name:"", deviceType:"gate", status:"active", area:"", gateDirection:"", cameraUrl:"", cameraSnapshotUrl:"", cameraDeviceCode:"", printerDeviceCode:"" };
const typeLabel: Record<string,string> = { gate:"Gate", cashier:"Kasir", controller:"Controller", camera:"Kamera", printer:"Printer", sensor:"Sensor" };

export function DeviceManagement() {
  const { authState } = useAuth();
  const [devices,setDevices]=useState<any[]>([]);
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState<Form>(emptyForm);
  const [error,setError]=useState("");
  const [secret,setSecret]=useState<{deviceCode:string;secret:string}|null>(null);
  const canManage=authState.type==="authenticated"&&(authState.user.role==="admin"||authState.user.role==="supervisor");

  const load=async()=>{ try{ setDevices(await getParkingDevices()); }catch(e){ setError(e instanceof Error?e.message:"Gagal memuat perangkat"); } };
  useEffect(()=>{ load(); const timer=setInterval(load,5000); return ()=>clearInterval(timer); },[]);

  const sorted=useMemo(()=>[...devices].sort((a,b)=>a.deviceCode.localeCompare(b.deviceCode)),[devices]);
  const healthFor=(d:any)=>{
    const age=d.lastSeenAt?Math.max(0,Date.now()-new Date(d.lastSeenAt).getTime()):Infinity;
    const health=d.capabilities?.health||{};
    const degraded=["sensor","camera","printer","barrier"].some(k=>health[k]==="error"||health[k]==="warning");
    return {online:age<=45000&&d.status==="active",age,health,degraded};
  };
  const healthLabel=(value:string|undefined)=>value==="ok"?"OK":value==="warning"?"Peringatan":value==="error"?"Error":"—";
  const save=async()=>{
    setError("");
    try{
      const payload={action:(form.id?"update":"create") as "update"|"create",id:form.id,deviceCode:form.deviceCode,name:form.name,deviceType:form.deviceType,status:form.status,area:form.area||null,gateDirection:form.gateDirection||null,cameraUrl:form.cameraUrl||null,cameraSnapshotUrl:form.cameraSnapshotUrl||null,capabilities:{cameraDeviceCode:form.cameraDeviceCode||undefined,printerDeviceCode:form.printerDeviceCode||undefined}};
      const row=await postParkingDevice(payload);
      setDevices(prev=>form.id?prev.map(d=>String(d.id)===String(row.id)?row:d):[...prev,row]);
      setOpen(false); setForm(emptyForm);
    }catch(e){ setError(e instanceof Error?e.message:"Gagal menyimpan perangkat"); }
  };
  const provision=async(d:Device)=>{
    if(!canManage)return;
    if(!window.confirm(`Buat ulang kredensial untuk ${d.deviceCode}? Kredensial lama akan langsung dicabut.`))return;
    try{ setError(""); const row=await postParkingDeviceProvision({deviceId:String(d.id)}); setSecret({deviceCode:row.deviceCode,secret:row.secret}); }
    catch(e){ setError(e instanceof Error?e.message:"Gagal membuat kredensial"); }
  };
  const toggle=async(d:Device)=>{
    if(!canManage)return;
    const status=d.status==="active"?"inactive":"active";
    try{ const row=await postParkingDevice({action:"setStatus",id:String(d.id),status,capabilities:{}}); setDevices(prev=>prev.map(x=>String(x.id)===String(row.id)?row:x)); }
    catch(e){ setError(e instanceof Error?e.message:"Gagal mengubah status"); }
  };

  return <section className={styles.wrap}>
    <div className={styles.head}>
      <div><h2>Perangkat & Gate</h2><p>Konfigurasi gate, kasir, kamera, controller, printer, dan sensor tanpa mengunci jumlah perangkat.</p></div>
      {canManage&&<Button onClick={()=>{setForm(emptyForm);setError("");setOpen(true)}}><Plus size={16}/> Tambah perangkat</Button>}
    </div>
    {error&&<div className={styles.error}>{error}</div>}
    <div className={styles.summary}><span><strong>{devices.length}</strong> perangkat</span><span><i className={styles.live}/> monitoring LAN aktif</span><span>{devices.filter(d=>d.status==="active").length} aktif</span></div>
    <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>PERANGKAT</th><th>JENIS</th><th>AREA / ARAH</th><th>KAMERA</th><th>KESEHATAN</th><th>STATUS</th>{canManage&&<th></th>}</tr></thead><tbody>
      {sorted.map(d=><tr key={String(d.id)}>
        <td><strong>{d.name}</strong><span className={styles.code}>{d.deviceCode}</span></td>
        <td>{typeLabel[d.deviceType]||d.deviceType}</td>
        <td>{d.area||"—"} {d.gateDirection&&<small>· {d.gateDirection==="in"?"Masuk":"Keluar"}</small>}</td>
        <td>{d.cameraUrl?<span className={styles.camera}><Video size={13}/> Live dikonfigurasi</span>:<span className={styles.muted}>Tidak ada</span>}</td>
        <td><div className={styles.health}>{(() => { const h=healthFor(d); return <><Badge variant={h.online?(h.degraded?"warning":"success"):"outline"}>{h.online?(h.degraded?"Degraded":"Online"):"Offline"}</Badge><span className={styles.healthParts}>S {healthLabel(h.health.sensor)} · K {healthLabel(h.health.camera)} · P {healthLabel(h.health.printer)} · B {healthLabel(h.health.barrier)}</span><span className={styles.heartbeat}>{Number.isFinite(h.age)?`Heartbeat ${Math.round(h.age/1000)} dtk lalu`:"Belum heartbeat"}</span></>; })()}</div></td>
        <td><Badge variant={d.status==="active"?"success":d.status==="maintenance"?"warning":"outline"}>{d.status==="active"?"Aktif":d.status==="maintenance"?"Maintenance":"Nonaktif"}</Badge></td>
        {canManage&&<td><div className={styles.actions}><button title="Edit" onClick={()=>{setForm({id:String(d.id),deviceCode:d.deviceCode,name:d.name,deviceType:d.deviceType as Form["deviceType"],status:d.status as Form["status"],area:d.area||"",gateDirection:(d.gateDirection||"") as Form["gateDirection"],cameraUrl:d.cameraUrl||"",cameraSnapshotUrl:d.cameraSnapshotUrl||"",cameraDeviceCode:d.capabilities?.cameraDeviceCode||"",printerDeviceCode:d.capabilities?.printerDeviceCode||""});setError("");setOpen(true)}}><Pencil size={14}/></button><button title="Buat kredensial" onClick={()=>provision(d)}><Radio size={14}/></button><button title={d.status==="active"?"Nonaktifkan":"Aktifkan"} onClick={()=>toggle(d)}><Power size={14}/></button></div></td>}
      </tr>)}
      {!sorted.length&&<tr><td colSpan={canManage?6:5} className={styles.empty}>Belum ada perangkat terdaftar.</td></tr>}
    </tbody></table></div>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogHeader><DialogTitle>{form.id?"Edit perangkat":"Tambah perangkat"}</DialogTitle><DialogDescription>Gunakan kode unik seperti GATE-IN-001, GATE-OUT-001, KASIR-001, atau CAM-IN-001.</DialogDescription></DialogHeader>
      <div className={styles.form}>
        <label>Kode perangkat<Input value={form.deviceCode} onChange={e=>setForm({...form,deviceCode:e.target.value.toUpperCase()})} placeholder="GATE-IN-001"/></label>
        <label>Nama perangkat<Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Gate In 01"/></label>
        <label>Jenis<select value={form.deviceType} onChange={e=>setForm({...form,deviceType:e.target.value as Form["deviceType"]})}>{Object.entries(typeLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as Form["status"]})}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="maintenance">Maintenance</option></select></label>
        <label>Area / lokasi<Input value={form.area} onChange={e=>setForm({...form,area:e.target.value})} placeholder="Area A / Pintu Utama"/></label>
        <label>Arah gate<select value={form.gateDirection} onChange={e=>setForm({...form,gateDirection:e.target.value as Form["gateDirection"]})}><option value="">Tidak ada</option><option value="in">Masuk</option><option value="out">Keluar</option></select></label>
        <label className={styles.full}>URL live camera<Input value={form.cameraUrl} onChange={e=>setForm({...form,cameraUrl:e.target.value})} placeholder="RTSP / HTTP sesuai kamera"/></label>
        <label className={styles.full}>URL snapshot camera<Input value={form.cameraSnapshotUrl} onChange={e=>setForm({...form,cameraSnapshotUrl:e.target.value})} placeholder="HTTP/JPEG snapshot"/></label><label>Device kamera terhubung<Input value={form.cameraDeviceCode} onChange={e=>setForm({...form,cameraDeviceCode:e.target.value.toUpperCase()})} placeholder="CAM-IN-001"/></label><label>Device printer terhubung<Input value={form.printerDeviceCode} onChange={e=>setForm({...form,printerDeviceCode:e.target.value.toUpperCase()})} placeholder="PRINTER-IN-001"/></label>
      </div>
      <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Batal</Button><Button onClick={save} disabled={!form.deviceCode||!form.name}>Simpan perangkat</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!secret} onOpenChange={(open)=>!open&&setSecret(null)}><DialogContent>
      <DialogHeader><DialogTitle>Kredensial perangkat</DialogTitle><DialogDescription>Simpan secret ini di firmware ESP32. Secret hanya ditampilkan sekarang; pembuatan ulang akan mencabut secret sebelumnya.</DialogDescription></DialogHeader>
      <div className={styles.secretBox}><strong>{secret?.deviceCode}</strong><code>{secret?.secret}</code></div>
      <DialogFooter><Button onClick={()=>setSecret(null)}>Selesai</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
