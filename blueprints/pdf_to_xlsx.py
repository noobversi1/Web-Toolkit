import io,os,tempfile
from flask import Blueprint,request,send_file,render_template,current_app,jsonify
import pdfplumber,pandas as pd
from werkzeug.utils import secure_filename
pdf_to_xlsx_bp=Blueprint('pdf_to_xlsx_bp',__name__,url_prefix='/pdf-to-xlsx')
@pdf_to_xlsx_bp.route('/',methods=['GET'])
def form():return render_template('pdf_to_xlsx.html')
def try_table_parse(pdf_path,prefer_stream=False):
    tables_out=[]
    try:
        with pdfplumber.open(pdf_path)as pdf:
            for(i,page)in enumerate(pdf.pages,start=1):
                table_settings={'vertical_strategy':'text'}if prefer_stream else{};tables=page.extract_tables(table_settings)if hasattr(page,'extract_tables')else[]
                if not tables:
                    try:
                        tbl=page.extract_table()
                        if tbl:tables=[tbl]
                    except Exception:tables=[]
                for(t_index,table)in enumerate(tables,start=1):
                    try:df=pd.DataFrame(table);df.columns=df.iloc[0].fillna('').astype(str);df=df[1:].reset_index(drop=True)
                    except Exception:df=pd.DataFrame(table)
                    sheet_name=f"p{str(i)}_t{t_index}";tables_out.append((sheet_name,df))
    except Exception as e:current_app.logger.error(f"pdfplumber parse error: {e}")
    return tables_out
def fallback_text_parse(pdf_path):
    sheets=[]
    try:
        with pdfplumber.open(pdf_path)as pdf:
            all_rows=[]
            for(i,page)in enumerate(pdf.pages,start=1):
                text=page.extract_text()or'';lines=[ln.strip()for ln in text.splitlines()if ln.strip()]
                for ln in lines:parts=[p.strip()for p in __import__('re').split('\\s{2,}',ln)if p.strip()];all_rows.append(parts)
            max_cols=max((len(r)for r in all_rows),default=1);rows_norm=[r+['']*(max_cols-len(r))for r in all_rows];df=pd.DataFrame(rows_norm);sheets.append(('extracted_text',df))
    except Exception as e:current_app.logger.error(f"fallback_text_parse error: {e}")
    return sheets
@pdf_to_xlsx_bp.route('/process',methods=['POST'])
def process():
    if'file'not in request.files:return'Tidak ada file yang diunggah',400
    uploaded_file=request.files['file']
    if uploaded_file.filename=='':return'Nama file kosong',400
    if not uploaded_file.filename.lower().endswith('.pdf'):return'Hanya file PDF yang diizinkan',400
    prefer_stream=request.form.get('prefer_stream','0')=='1';merge_tables=request.form.get('merge_tables','1')=='1';tmp=None
    try:
        with tempfile.NamedTemporaryFile(delete=False,suffix='.pdf')as tmpf:uploaded_file.save(tmpf.name);tmp=tmpf.name
        tables=try_table_parse(tmp,prefer_stream=prefer_stream)
        if not tables:tables=fallback_text_parse(tmp)
        out_buf=io.BytesIO()
        with pd.ExcelWriter(out_buf,engine='openpyxl')as writer:
            if merge_tables and len(tables)>0:
                try:
                    concat_dfs=[]
                    for(name,df)in tables:concat_dfs.append(df)
                    merged=pd.concat(concat_dfs,ignore_index=True,sort=False);merged.to_excel(writer,sheet_name='Sheet1',index=False)
                except Exception:
                    for(name,df)in tables:safe_name=name[:30];df.to_excel(writer,sheet_name=safe_name,index=False)
            else:
                for(name,df)in tables:
                    safe_name=name[:30];alt=safe_name;counter=1
                    while alt in writer.book.sheetnames:alt=f"{safe_name}_{counter}";counter+=1
                    df.to_excel(writer,sheet_name=alt,index=False)
        out_buf.seek(0);filename='pdf_xlsx_web_toolkit.xlsx';return send_file(out_buf,as_attachment=True,download_name=filename,mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:current_app.logger.error(f"Error pdf->xlsx: {e}");return f"Terjadi kesalahan saat ekstraksi: {e}",500
    finally:
        if tmp and os.path.exists(tmp):
            try:os.remove(tmp)
            except Exception:pass
