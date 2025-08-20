// supabase-client.js
// MACHETE: Ahora las claves se leen de las variables de entorno de Netlify.
const SUPABASE_URL = 'https://jbenfvckviqdfmjzjomi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiZW5mdmNrdmlxZGZtanpqb21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2NjY2MjYsImV4cCI6MjA2ODI0MjYyNn0.f2Xqrj1XoufKQpeOkqx6_SunYs7dcyuvjBFCwWY0Ors';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);