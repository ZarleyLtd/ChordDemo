-- App renamed from ChordDemo to Stomper: rename its schema. Tables, the index, RLS and the
-- revoked grants all move with the schema. Read and written only through the stomper-api Edge Function.
alter schema chorddemo rename to stomper;
