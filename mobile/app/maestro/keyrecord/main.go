// Command keyrecord prints a new encryption key record for a passphrase, as a device makes
// it when encryption is turned on (web/src/lib/crypto.ts createKeyRecord): run.sh stores it
// to encrypt the test account before the app's e2ee-unlock flow. Test tooling only.
//
//	go run ./mobile/app/maestro/keyrecord <passphrase>
package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/OpenTodoApp/opentodo/internal/e2ee"
	"github.com/OpenTodoApp/opentodo/internal/e2ee/crypt"
)

func main() {
	if len(os.Args) != 2 || crypt.NeedsNormalisation(os.Args[1]) {
		fmt.Fprintln(os.Stderr, "usage: keyrecord <ascii passphrase>")
		os.Exit(2)
	}
	if err := run(os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, "keyrecord:", err)
		os.Exit(1)
	}
}

func run(passphrase string) error {
	b64 := base64.RawURLEncoding
	key, salt, recovery := random(32), random(16), random(32)
	const iterations = 600_000
	kek, err := crypt.PassphraseKEK(passphrase, salt, iterations)
	if err != nil {
		return err
	}
	byPassphrase, err := crypt.Wrap(kek, key)
	if err != nil {
		return err
	}
	rkek, err := crypt.RecoveryKEK(recovery)
	if err != nil {
		return err
	}
	byRecovery, err := crypt.Wrap(rkek, key)
	if err != nil {
		return err
	}
	rec := e2ee.KeyRecord{Version: 1, KDF: 1, Salt: b64.EncodeToString(salt), Iterations: iterations,
		WrappedByPassphrase: b64.EncodeToString(byPassphrase), WrappedByRecovery: b64.EncodeToString(byRecovery)}
	if err := crypt.CheckRecord(rec); err != nil {
		return err
	}
	if got, err := crypt.UnlockWithPassphrase(rec, passphrase); err != nil || string(got) != string(key) {
		return fmt.Errorf("the record does not unlock: %v", err)
	}
	return json.NewEncoder(os.Stdout).Encode(rec)
}

func random(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}
