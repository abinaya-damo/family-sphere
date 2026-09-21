/* Family Sphere v284: download document as an actual PDF. No third-party service or data upload. */
(()=>{'use strict';
  const nameOf=doc=>String(doc?.fileName||doc?.name||'document').replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,130)||'document';
  const isPdf=(doc,blob)=>/\.pdf$/i.test(doc?.fileName||'')||/application\/pdf/i.test(doc?.fileType||'')||blob.type==='application/pdf';
  const isImage=(doc,blob)=>/^image\/(jpeg|jpg|png|webp|gif|bmp)$/i.test(doc?.fileType||'')||/^image\/(jpeg|jpg|png|webp|gif|bmp)$/i.test(blob.type)||/\.(jpe?g|png|webp|gif|bmp)$/i.test(doc?.fileName||'');
  async function imagePdf(blob){
    const url=URL.createObjectURL(blob);let image;
    try{
      image=new Image();image.src=url;
      await image.decode();
      const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));
      const w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale));
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser cannot convert this image to PDF');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);
      const jpeg=canvas.toDataURL('image/jpeg',0.87).split(',')[1];
      const binary=atob(jpeg);const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      // A4 portrait or landscape; retain aspect ratio within 24 pt margins.
      const landscape=w>h;const pw=landscape?842:595,ph=landscape?595:842;
      const factor=Math.min((pw-48)/w,(ph-48)/h),dw=w*factor,dh=h*factor,x=(pw-dw)/2,y=(ph-dh)/2;
      const enc=new TextEncoder();const parts=[];let offset=0;const offsets=[0];
      const add=part=>{parts.push(part);offset+=part.length};const str=s=>add(enc.encode(s));
      str('%PDF-1.4\n');
      function obj(id,header,stream){offsets[id]=offset;str(`${id} 0 obj\n${header}`);if(stream){str(`\nstream\n`);add(stream);str('\nendstream')}str('\nendobj\n')}
      obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
      obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
      obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`);
      obj(4,`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>`,bytes);
      const content=enc.encode(`q\n${dw.toFixed(3)} 0 0 ${dh.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im1 Do\nQ\n`);
      obj(5,`<< /Length ${content.length} >>`,content);
      const xref=offset;str('xref\n0 6\n0000000000 65535 f \n');
      for(let id=1;id<=5;id++)str(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
      str(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      return new Blob(parts,{type:'application/pdf'});
    }finally{URL.revokeObjectURL(url)}
  }
  async function download(doc,blob){
    if(!(blob instanceof Blob)||!blob.size)throw new Error('Document file is missing');
    let pdf;
    if(isPdf(doc,blob)){
      const signature=new TextDecoder().decode(await blob.slice(0,5).arrayBuffer());
      if(signature!=='%PDF-')throw new Error('The stored file is not a valid PDF');
      pdf=blob;
    }else if(isImage(doc,blob))pdf=await imagePdf(blob);
    else throw new Error('PDF conversion supports PDF and image documents. This file type cannot be safely converted in the browser.');
    const url=URL.createObjectURL(pdf);try{
      const a=document.createElement('a');a.href=url;a.download=`${nameOf(doc)}.pdf`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),30000)}
  }
  window.FamilySpherePdf={download};
})();
