# Test Report for Fixed Changes

## Scope of fixed changes

The following files were modified during this fix and validation cycle:

- `.github/workflows/build.yml`
- `app/core/src/main/java/stirling/software/SPDF/controller/api/misc/ReplaceAndInvertColorController.java`
- `app/core/src/test/java/stirling/software/SPDF/controller/api/misc/ReplaceAndInvertColorControllerTest.java`
- `gradlew`

## Test commands run

1. `./gradlew :stirling-pdf:test -PnoSpotless`
   - Result: **FAILED**
   - Failure reason: `:stirling-pdf:compileJava` could not delete `app/core/build/classes/java/main` because another Gradle process was writing there concurrently.

2. `./gradlew :stirling-pdf:compileJava -PnoSpotless`
   - Result: **PASSED** (`BUILD SUCCESSFUL`)
   - Note: confirms main source compilation succeeded with current changes.

3. Re-run `./gradlew :stirling-pdf:test -PnoSpotless` (after concurrent build finished)
   - Result: **FAILED**
   - Failure stage: `:stirling-pdf:compileTestJava`
   - Error type: widespread `cannot find symbol` errors in test sources.

4. Added wrapper-level Gradle process lock and re-ran `./gradlew :stirling-pdf:test -PnoSpotless`
   - Result: **FAILED** (same `:stirling-pdf:compileTestJava` symbol errors)
   - Key point: the previous output-directory deletion race condition did **not** recur.

5. Forced full recompilation: `./gradlew :stirling-pdf:compileTestJava -PnoSpotless --rerun-tasks`
   - Result: **FAILED**
   - Root cause surfaced: compile errors in `ReplaceAndInvertColorControllerTest` (duplicate local variables and stale `ResponseEntity<Resource>` typing after controller return type update to `ResponseEntity<byte[]>`).

6. Applied test fixes and re-ran `./gradlew :stirling-pdf:compileTestJava -PnoSpotless`
   - Result: **PASSED** (`BUILD SUCCESSFUL`)

7. Final validation: `./gradlew :stirling-pdf:test -PnoSpotless`
   - Result: **PASSED** (`BUILD SUCCESSFUL`)
   - Coverage summary:
     - LINE: **33.40%** (PASS, target >= 13.00%)
     - INSTRUCTION: **33.91%** (PASS, target >= 14.00%)
     - BRANCH: **26.79%** (PASS, target >= 9.00%)

## Assessment

- The production code changes compile successfully.
- The wrapper-level lock mitigates the previously observed concurrent Gradle output race.
- The backend test block was resolved by fixing `ReplaceAndInvertColorControllerTest` to match current controller behavior and response type.
- Full backend module tests now pass with coverage gates passing.
- CI workflow YAML changes remain locally unexecuted (they are GitHub Actions runtime behavior), but they are syntactically valid in diff context.

