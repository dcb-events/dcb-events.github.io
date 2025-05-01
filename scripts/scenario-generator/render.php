<?php

declare(strict_types=1);

use Wwwision\DcbExampleGenerator\Example;

use Wwwision\DcbExampleGenerator\GeneratorJS;
use Wwwision\DcbExampleGenerator\GeneratorTS;
use Wwwision\DcbExampleGenerator\Normalizer as ExampleNormalizer;

use function Wwwision\Types\instantiate;

require __DIR__ . '/vendor/autoload.php';

$contents = file_get_contents('php://stdin');
try {
    $decoded = json_decode(trim($contents), true, 512, JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    echo 'Error decoding JSON: ' . $e->getMessage();
    exit(1);
}
$example = instantiate(Example::class, $decoded);

$indent = static fn(string $string) => preg_replace_callback('/^/m', static fn () => '    ', $string);

$js = trim($indent((new GeneratorJS($example))->generate()));
$ts = trim($indent((new GeneratorTS($example))->generate()));
$normalized = (new ExampleNormalizer())->normalize($example);
$eventDefinitions = htmlentities(json_encode($normalized['eventDefinitions']));
$testCases = htmlentities(json_encode($normalized['testCases']));
//
//echo $ts;
//exit;

echo <<<MD
=== "JavaScript"
    ??? info
        This example uses [composed projections](../topics/projections.md) to build Decision Models.
        
        The actual implementation is just an in-memory dummy (see source code[:octicons-link-external-16:](../assets/js/lib.js){:target="_blank" .small})
    ```js
    $js
    ```
    <codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib2.js"></codapi-snippet>

=== "TypeScript (WIP)"
    ??? example "Experimental: 3rd party library"
        This example is based on the unofficial, work-in-progress, `@dcb-es/event-store`[:octicons-link-external-16:](https://github.com/sennentech/dcb-event-sourced/wiki){:target="_blank" .small} package
    ```typescript
    $ts
    ```

=== "GWT (WIP)"
    ??? example "Experimental: 3rd party library"
        This example uses an unofficial, work-in-progress, library to visualize Given/When/Then scenarios
    <dcb-scenario
      style="font-size: xx-small"
      eventDefinitions="$eventDefinitions"
      testCases="$testCases"></dcb-scenario>

MD;