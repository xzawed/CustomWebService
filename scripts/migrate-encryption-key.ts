/**
 * ENCRYPTION_KEY 마이그레이션 스크립트
 *
 * 사용법:
 *   OLD_ENCRYPTION_KEY=<기존키> NEW_ENCRYPTION_KEY=<신규키> \
 *   NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx tsx scripts/migrate-encryption-key.ts
 *
 * 동작:
 *   1. user_api_keys 테이블 전체 조회
 *   2. 각 행의 encrypted_key를 OLD_ENCRYPTION_KEY로 복호화
 *   3. NEW_ENCRYPTION_KEY로 재암호화
 *   4. DB 업데이트
 *
 * 주의사항:
 *   - 프로덕션 실행 전 반드시 스테이징/백업 환경에서 검증
 *   - 실행 중 서버 중단 시 부분 마이그레이션 상태 → 재실행 가능 (멱등성 보장)
 *   - 재실행 시 이미 NEW_KEY로 암호화된 행은 복호화 실패 → 자동 스킵 (오류 로그 출력)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const ALGORITHM = 'aes-256-gcm';

function makeKey(raw: string): Buffer {
  const buf = Buffer.from(raw, 'utf8');
  if (buf.byteLength < 32) throw new Error('키가 32바이트 미만입니다.');
  return buf.subarray(0, 32);
}

function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('잘못된 암호화 형식');
  const [ivHex, tagHex, encHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function main() {
  const oldKeyRaw = process.env.OLD_ENCRYPTION_KEY;
  const newKeyRaw = process.env.NEW_ENCRYPTION_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!oldKeyRaw || !newKeyRaw || !supabaseUrl || !serviceRoleKey) {
    console.error('필수 환경변수 누락: OLD_ENCRYPTION_KEY, NEW_ENCRYPTION_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (oldKeyRaw === newKeyRaw) {
    console.error('OLD_ENCRYPTION_KEY와 NEW_ENCRYPTION_KEY가 동일합니다. 다른 키를 사용하세요.');
    process.exit(1);
  }

  const oldKey = makeKey(oldKeyRaw);
  const newKey = makeKey(newKeyRaw);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log('user_api_keys 조회 중...');
  const { data: rows, error: fetchError } = await supabase
    .from('user_api_keys')
    .select('id, encrypted_key')
    .not('encrypted_key', 'is', null);

  if (fetchError) {
    console.error('조회 실패:', fetchError.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('마이그레이션할 행이 없습니다.');
    return;
  }

  console.log(`총 ${rows.length}개 행 처리 시작...`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const { id, encrypted_key } = row as { id: string; encrypted_key: string };

    let plaintext: string;
    try {
      plaintext = decrypt(encrypted_key, oldKey);
    } catch {
      // 이미 new key로 암호화되었거나 형식이 다름 → 스킵
      console.warn(`[SKIP] id=${id}: 복호화 실패 (이미 마이그레이션됐거나 형식 오류)`);
      skipped++;
      continue;
    }

    const newEncrypted = encrypt(plaintext, newKey);

    const { error: updateError } = await supabase
      .from('user_api_keys')
      .update({ encrypted_key: newEncrypted })
      .eq('id', id);

    if (updateError) {
      console.error(`[FAIL] id=${id}: ${updateError.message}`);
      failed++;
    } else {
      success++;
      if (success % 10 === 0) console.log(`  처리 완료: ${success}/${rows.length}`);
    }
  }

  console.log('\n=== 마이그레이션 완료 ===');
  console.log(`성공: ${success}, 스킵: ${skipped}, 실패: ${failed}`);

  if (failed > 0) {
    console.error(`${failed}개 행 업데이트 실패. 로그를 확인하고 재실행하세요.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('예상치 못한 오류:', err);
  process.exit(1);
});
