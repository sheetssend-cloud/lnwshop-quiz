import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import OpenAI from 'openai';


const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));


const upload = multer({ dest: 'uploads/' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


// โหลดคอนฟิก
const config = JSON.parse(fs.readFileSync('ads-config.json', 'utf-8'));


// สร้าง PROMPT 5 แบบ ตาม schema
app.post('/api/generate-prompts', upload.single('image_file'), async (req, res) => {
    try {
        const editBrief = req.body.edit_brief || '';


        // ตรวจชนิดไฟล์แบบเบื้องต้น (ไม่แก้/ลบลายน้ำ)
        if (req.file) {
            const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype);
            if (!ok) {
                fs.unlink(req.file.path, () => { });
                return res.status(400).json({ error: 'รองรับเฉพาะ JPG/PNG/WebP' });
            }
        }


        const schema = config.output_contract;
        const sys = `คุณเป็นนักออกแบบโฆษณา สร้าง prompt ภาษาไทยเพื่อสร้างภาพโปสเตอร์ โดย\n- หลีกเลี่ยงข้อความ/โลโก้/ลายน้ำในผลลัพธ์\n- ปฏิบัติตาม prompt_rules ในคอนฟิก\n- คืนค่าตาม JSON Schema อย่างเคร่งครัด`;


        const user = `บริบทผู้ใช้: ${editBrief || 'ไม่ระบุ'}\nโปรดสร้างเวอร์ชันที่แตกต่างกัน 5 แบบ แต่คุมธีมให้สอดคล้องกัน\nทุกเวอร์ชันต้องกำหนด aspect_ratio และ negative_prompt_th`;


        const resp = await openai.responses.create({
            model: 'gpt-4.1-mini',
            input: [
                { role: 'system', content: sys },
                { role: 'user', content: user }
            ],
            response_format: {
                type: 'json_schema',
                json_schema: { name: 'ADSOutput', schema, strict: true }
            }
        });


        const data = JSON.parse(resp.output_text);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด', detail: String(err) });
    } finally {
        if (req.file) fs.unlink(req.file.path, () => { });
    }
});


// (ตัวเลือกเสริม) เรียกสร้างรูปจาก prompt
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt, size = '1024x1280' } = req.body;
        if (!prompt) return res.status(400).json({ error: 'ต้องส่ง prompt' });


        const img = await openai.images.generate({
            model: 'gpt-image-1',
            prompt,
            size
        });


        const b64 = img.data?.[0]?.b64_json;
        if (!b64) return res.status(500).json({ error: 'ไม่ได้รับภาพจาก API' });
        res.json({ image_base64: b64 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'สร้างภาพไม่สำเร็จ', detail: String(err) });
    }
});


app.listen(3000, () => console.log('✅ Server running at http://localhost:3000'));