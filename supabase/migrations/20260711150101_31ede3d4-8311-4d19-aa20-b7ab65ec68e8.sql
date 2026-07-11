CREATE POLICY "Users read own research attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'research-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users upload own research attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'research-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own research attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'research-attachments' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'research-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own research attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'research-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);