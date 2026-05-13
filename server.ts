import express from 'express';
import cors from 'cors';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase клиент
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============= API ROUTES =============

app.get('/api/data', async (req, res) => {
  try {
    const { data: tickets } = await supabase.from('tickets').select('*');
    const { data: assignments } = await supabase.from('assignments').select('*');
    res.json({ tickets: tickets || [], assignments: assignments || [] });
  } catch (err: any) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.post('/api/tickets/upload', async (req, res) => {
  console.log('=== UPLOAD REQUEST ===');
  
  try {
    const { tickets } = req.body;
    
    if (!tickets || !Array.isArray(tickets)) {
      return res.status(400).json({ error: 'Invalid tickets data' });
    }
    
    console.log(`✅ Received ${tickets.length} tickets`);
    
    // Очищаем старые билеты
    await supabase.from('tickets').delete().neq('id', '');
    await supabase.from('assignments').delete().neq('id', '');
    
    // Загружаем новые
    const { error } = await supabase.from('tickets').insert(tickets);
    if (error) throw error;
    
    console.log(`✅ Saved ${tickets.length} tickets`);
    res.json({ success: true, count: tickets.length });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload: ' + err.message });
  }
});

app.post('/api/tickets/reset', async (req, res) => {
  try {
    await supabase
      .from('tickets')
      .update({
        status: 'free',
        studentName: null,
        studentGroup: null,
        takenAt: null
      })
      .neq('id', '');
    
    await supabase.from('assignments').delete().neq('id', '');
    
    res.json({ success: true });
  } catch (err: any) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Failed to reset' });
  }
});

app.post('/api/tickets/take', async (req, res) => {
  try {
    const { ticketId, studentName, studentGroup } = req.body;
    
    const { data: ticket, error: findError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();
    
    if (!ticket) return res.status(404).json({ error: 'Not found' });
    if (ticket.status !== 'free') return res.status(400).json({ error: 'Taken' });
    
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        status: 'taken',
        studentName,
        studentGroup,
        takenAt: new Date().toISOString()
      })
      .eq('id', ticketId);
    
    if (updateError) throw updateError;
    
    res.json({ ...ticket, status: 'taken', studentName, studentGroup });
  } catch (err: any) {
    console.error('Take error:', err);
    res.status(500).json({ error: 'Failed to take' });
  }
});

app.post('/api/assignments', async (req, res) => {
  try {
    const assignment = req.body;
    const { error } = await supabase
      .from('assignments')
      .insert({
        ...assignment,
        id: Date.now().toString(),
        createdAt: new Date().toISOString()
      });
    
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error('Add assignment error:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

app.delete('/api/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await supabase.from('assignments').delete().eq('id', id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete assignment error:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ============= SERVE FRONTEND =============

if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  console.log('🛠️  Development mode: Vite middleware enabled');
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log('🚀 Production mode: Serving static files');
}

// ============= START SERVER =============

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log('📋 Admin login: Admin / Exam2024!');
  console.log('✅ Connected to Supabase\n');
});