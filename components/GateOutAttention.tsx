"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Input } from "./Input";

export function GateOutAttention(){
  const [items,setItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<any>(null);
  const [reason,setReason]=useState("");
  const [message,setMessage]=useState("");
  const load=async()=>{setLoading(true);try{const r=await fetch("/api/parking/exitAttention");const j=await r.json();setItems(j.operations||[]);}finally{setLoading(false);}};
  useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t);},[]);
  const retry=async(correlationId:string)=>{setMessage("");const r=await fetch("/api/parking/commandRetry",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({correlationId})});const j=await r.json();setMessage(r.ok?"Perintah dimasukkan kembali ke antrean.":(j.error||"Retry gagal"));await load();};
  const resolve=async()=>{if(!selected)return;const r=await fetch("/api/parking/exitAttentionResolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationId:selected.id,reason})});const j=await r.json();setMessage(r.ok?"Perhatian diselesaikan secara manual.":(j.error||"Gagal menyelesaikan"));if(r.ok){setSelected(null);setReason("");}await load();};
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:16}}>
      <div><h2 style={{margin:0}}>Perlu perhatian Gate Out</h2><p style={{margin:"4px 0 0",opacity:.7}}>Pembayaran sudah tercatat; item di sini membutuhkan pengecekan perangkat atau resolusi manual.</p></div>
      <Badge variant={items.length?"warning":"success"}>{loading?"Memuat…":items.length+" perhatian"}</Badge>
    </div>
    {message&&<p>{message}</p>}
    {!loading&&!items.length?<div style={{padding:24,textAlign:"center",border:"1px solid #ddd",borderRadius:12}}><CheckCircle2 size={24}/><p>Semua operasi Gate Out normal.</p></div>:
    <div style={{display:"grid",gap:10}}>{items.map(item=><div key={String(item.id)} style={{border:"1px solid #ddd",borderRadius:12,padding:14}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12}}><strong>{item.ticketNo}</strong><Badge variant={item.status==="attention"?"warning":"primary"}>{item.status==="attention"?"PERLU PERHATIAN":"MENUNGGU PERANGKAT"}</Badge></div>
      <div style={{marginTop:8,fontSize:13,opacity:.8}}>Error: {item.lastError||"Menunggu command Gate Out selesai"}</div>
      {Array.isArray(item.warnings)&&item.warnings.length>0&&<div style={{marginTop:4,fontSize:13}}>Perangkat pendukung: {item.warnings.join(", ")}</div>}
      <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
        {(item.failedCommands||[]).map((cmd:any)=><Button key={cmd.correlationId} variant="outline" onClick={()=>retry(cmd.correlationId)}><RotateCcw size={15}/> Ulangi {cmd.commandType}</Button>)}
        {item.status==="attention"&&<Button variant="outline" onClick={()=>setSelected(item)}><AlertTriangle size={15}/> Tandai selesai manual</Button>}
      </div>
    </div>)}</div>}
    <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}><DialogContent><DialogHeader><DialogTitle>Selesaikan perhatian Gate Out</DialogTitle><DialogDescription>Tiket {selected?.ticketNo}. Masukkan alasan setelah kondisi kendaraan/barrier dipastikan aman.</DialogDescription></DialogHeader><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Contoh: barrier dibuka manual oleh supervisor"/><DialogFooter><Button variant="outline" onClick={()=>setSelected(null)}>Batal</Button><Button onClick={resolve} disabled={reason.trim().length<5}>Simpan resolusi</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
