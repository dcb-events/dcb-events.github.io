<?php

declare(strict_types=1);

use Wwwision\DcbExampleGenerator\Example;
use Wwwision\DcbExampleGenerator\GeneratorJS;
use Wwwision\DcbExampleGenerator\GeneratorTS;
use Wwwision\DcbExampleGenerator\Normalizer as ExampleNormalizer;

use function Wwwision\Types\instantiate;

require __DIR__ . '/vendor/autoload.php';

$cacheDir = __DIR__ . '/.cache';

$contents = file_get_contents('php://stdin');
try {
    $decoded = json_decode(trim($contents), true, 512, JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    echo 'Error decoding JSON: ' . $e->getMessage();
    exit(1);
}
$example = instantiate(Example::class, $decoded);
$mergeResult = null;

if ($example->meta->extends !== null) {
    $baseFile = $cacheDir . '/' . $example->meta->extends . '.json';
    if (!file_exists($baseFile)) {
        printf('Error: Example "%s" extends non existing example "%s"', $example->meta->id ?? '?', $example->meta->extends);
        exit(1);
    }
    $baseExample = instantiate(Example::class, json_decode(file_get_contents($baseFile), true, 512, JSON_THROW_ON_ERROR));
    $mergeResult = $baseExample->merge($example);
    $example = $mergeResult->mergedExample;
}
$example->validate();

if ($example->meta->id !== null) {
    file_put_contents($cacheDir . '/' . $example->meta->id . '.json', (new ExampleNormalizer())->toJson($example));
}

$codeDefinition = static function (string $language, array $highlightedNumbers): string {
    if ($highlightedNumbers === []) {
        return $language;
    }
    $res = [];
    $last = null;
    foreach ($highlightedNumbers as $i) {
        if ($last !== null && $last === $i - 1) {
            $res[count($res) - 1] = preg_replace('/-\d+$/', '', $res[count($res) - 1]) . '-' . $i;
        } else {
            $res[] = (string) $i;
        }
        $last = $i;
    }
    return '{.' . $language . ' .partial hl_lines="' . implode(' ', $res) . '"}';
};

$jsOutput = new GeneratorJS($example, $mergeResult)->generate();
$js = trim($jsOutput->render(4));
$jsDef = $codeDefinition('js', $jsOutput->highlightedLineNumbers);

$tsOutput = new GeneratorTS($example, $mergeResult)->generate();
$ts = trim($tsOutput->render(4));

$tsDef = $codeDefinition('typescript', $tsOutput->highlightedLineNumbers);

$normalized = (new ExampleNormalizer())->normalize($example);
$eventDefinitions = htmlentities(json_encode($normalized['eventDefinitions']));
$testCases = htmlentities(json_encode($normalized['testCases']));

//$url = '/playground?data=' . (new ExampleNormalizer())->toQueryParam($example);

echo <<<MD
=== "JavaScript"
    ??? info
        This example uses [composed projections](../topics/projections.md) to build Decision Models (explore library source code [:octicons-link-external-16:](https://github.com/dcb-events/dcb-events.github.io/tree/main/libraries/dcb){:target="_blank" .small})
    ```$jsDef
    $js
    ```
    <codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/dcb.js"></codapi-snippet>

=== "TypeScript"
    ??? info
        This example uses [composed projections](../topics/projections.md) to build Decision Models (explore library source code [:octicons-link-external-16:](https://github.com/dcb-events/dcb-events.github.io/tree/main/libraries/dcb){:target="_blank" .small})
    ```$tsDef
    $ts
    ```

=== "GWT (WIP)"
    ??? example "Experimental: 3rd party library"
        These Given/When/Then scenarios are visualized using an unofficial, work-in-progress, library
    <dcb-scenario
      style="font-size: xx-small"
      eventDefinitions="$eventDefinitions"
      testCases="$testCases"></dcb-scenario>

MD;
