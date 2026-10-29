import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('publisher finds its authenticated draft before the public tag endpoint exists and rejects ambiguous or mismatched drafts', () => {
  execFileSync('python', ['-B', '-c', `
import sys, types
sys.path.insert(0, 'tools')
import publish_fixed_release as publisher

repository, tag, digest = 'Adirm007/reader', 'v1.0.0', 'a' * 64
result = {'metadata': {'repository': repository, 'version': '1.0.0'},
          'tag': tag, 'distributionCommit': 'b' * 40, 'sourceCommit': 'c' * 40,
          'asset': 'fixture.regex.json', 'sha256': digest}
draft = {'id': 7, 'tag_name': tag, 'draft': True,
         'assets': [{'name': 'reader-fixed.regex.json', 'digest': 'sha256:' + digest}]}
state = {}
def run(*args, **kwargs):
    state['commands'].append(args)
    if args[:3] == ('gh', 'release', 'edit'):
        assert '--draft=false' in args
        state['published'] = True
    return ''
def github(path, **kwargs):
    state['requests'].append(path)
    if path == 'repos/' + repository + '/releases?per_page=100':
        assert not state['published']
        return state['drafts']
    if path == 'repos/' + repository + '/releases/tags/' + tag:
        # The real endpoint returns 404 until the draft has been published.
        assert state['published'], 'draft lookup must not use the public tag endpoint'
        return {'immutable': True, 'html_url': 'https://example.invalid/published'}
    raise AssertionError('unexpected endpoint: ' + path)
publisher.run, publisher.github = run, github
sys.modules['publish_update_catalog'] = types.SimpleNamespace(
    credential=lambda: 'fixture-credential',
    fetch_proof=lambda *args: ({'signed': True}, None),
    publish_catalog=lambda repo, versions: state.setdefault('catalogs', []).append((repo, versions)))

state.update(commands=[], requests=[], published=False, drafts=[
    {'tag_name': 'v0.9.0', 'draft': True},
    {'tag_name': tag, 'draft': False}, draft])
assert publisher.publish(result) == 'https://example.invalid/published'
assert state['requests'] == ['repos/' + repository + '/releases?per_page=100',
                             'repos/' + repository + '/releases/tags/' + tag]
assert len(state['catalogs']) == 1
assert [command[:3] for command in state['commands']] == [
    ('git', 'push', 'origin'), ('gh', 'release', 'create'),
    ('gh', 'release', 'upload'), ('gh', 'release', 'edit')]

for drafts, expected in [([draft, draft], '唯一'),
                          ([dict(draft, assets=[{'name': 'reader-fixed.regex.json', 'digest': 'sha256:' + 'f' * 64}])], 'digest'),
                          ([dict(draft, draft=False)], '唯一')]:
    state.update(commands=[], requests=[], published=False, drafts=drafts, catalogs=[])
    try:
        publisher.publish(result)
        raise AssertionError('unsafe draft must not publish')
    except ValueError as error:
        assert expected in str(error)
    assert not state['published'] and not state['catalogs']
    assert all(command[:3] != ('gh', 'release', 'edit') for command in state['commands'])
`], {cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe']});
});
