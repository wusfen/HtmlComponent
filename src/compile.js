import {
  parseHTML,
  quot,
  parseExp,
  output,
  parseFor,
  getVarNames,
  getUpdatePropsCode,
  detectTemplateError,
} from './utils/parse.js'
import {
  insertNode,
  removeNode,
  getAttribute,
  setAttribute,
  hasAttribute,
  removeAttribute,
  attr2prop,
  addClass,
  removeClass,
  computeStyle,
  on,
} from './utils/dom.js'


const ID_KEY = 'id'
const OLD_ID_KEY = `_old_${ID_KEY}`
const TEXT_PLACE_TAG = '_'

/**
 * ${1}
 * <ul title="${2}" .prop="22" [key]="222" ...="{a:2222}">
 *   <li for="const item of list3" if="item!=3" is="MyComponent" .value="3">
 *     ${4}
 *   </li>
 * </ul>
 * ==>
 * <text id=1>${1}</text>
 * <ul id=2>
 *   <li id=3>
 *     <text id=4>${4}</text>
 *   </li>
 * </ul>
 * ==>
 * self.prop(1, 'nodeValue', 1)
 * self.attr(2, 'title', `${2}`)
 * self.prop(2, 'prop', 22)
 * self.prop(2, key, 222)
 * self.prop(2, '..', {a:2222})
 * self.for(3, list3, function(item, $key, $index){
 *   self.if(item!=3, function() {
 *     self.prop(3, 'value', 3)
 *     self.is(3, 'MyComponent')
 *     self.prop(4, 'nodeValue', `${4}`)
 *   })
 * })
 * @param {string} tpl
 */
function compile(tpl) {
  const wrapper = parseHTML(tpl)
  let id = 0
  let scriptCode = '\n' // <script>...</script>
  let code = '\n' // render

  // <script>
  Array(...wrapper.getElementsByTagName('script')).forEach(e=>scriptCode += '// <script>' + e.innerHTML + '// </script>\n')


  loopNodeTree(wrapper.childNodes)
  function loopNodeTree(node) {
    // node || [node]
    if ('length' in node && !node.nodeType) {
      [...node].forEach(loopNodeTree)
      return
    }

    // id
    id++
    code += `\n// ${id}: ${(node.nodeValue || node.cloneNode().outerHTML).replace(/\s+/g, ' ')}\n`
    function getId() {
      return node['#id'] || (node['#id'] = ++id)
    }

    // skip
    if (/^(skip|script|style|template)$/i.test(node.tagName)) return

    // text: ${}
    if (node.nodeType === 3) {
      if (/\$?\{[^]*?\}/.test(node.nodeValue)) {
        // text id
        const text = document.createElement(TEXT_PLACE_TAG)
        text.setAttribute(ID_KEY, id)
        node.parentNode.insertBefore(text, node)
        text.appendChild(node)

        // ${exp}
        const exp = parseExp(node.nodeValue)
        code += `self.text('${id}', ${exp})\n`
        detectTemplateError(exp, node)
      }
      return
    }

    // for > if > .prop > is >>> childNodes <<< /if < /for

    // tag id
    const oldId = node.getAttribute(ID_KEY)
    if (oldId) node.setAttribute(OLD_ID_KEY, oldId)
    node.setAttribute(ID_KEY, id)

    // for
    const _for_ = parseFor(node.getAttribute('for'))
    if (_for_) {
      code += `self.for('${id}', ${_for_.list}, function(${_for_.item},${_for_.key},${_for_.index}){\n`
      detectTemplateError(_for_.raw.replace(/^\((.+)\)$/, '$1').replace(/var|let|const/g, ';"$&";').replace(/of/, ';"$&";'), node)
    }

    // if
    const _if_ = getAttribute(node, 'if')
    const _else_ = hasAttribute(node, 'else')
    if (_if_) {
      if (!_else_) {
        code += `self.if('${id}', ${_if_}, function(){\n`
      } else {
        code += `.elseif('${id}', ${_if_}, function(){\n`
        removeAttribute(node, 'else')
      }
      detectTemplateError(_if_, node)
      removeAttribute(node, 'if')
    } else if (_else_) {
      code += `.else('${id}', function(){\n`
      removeAttribute(node, 'else')
    }

    // [attr]
    Array(...node.attributes).forEach(attribute => {
      const attrName = attribute.nodeName
      const attrValue = attribute.nodeValue

      // on .on
      if (/^\.?on/.test(attrName)) {
        let onType = attrName
        let onCode = attrValue
        if (/^\./.test(attrName)) {
          onType = attrName.slice(1)
          onCode = `(${attrValue}).apply(this, arguments)`
        }
        code += `self.on('${id}', "${onType}", function(event){
          ${onCode}; self.render()
        })\n`

        detectTemplateError(onCode, attribute)
        removeAttribute(node, attrName)
        return
      }

      // .property [property]
      if (/^\.|^\[.*\]$/.test(attrName)) {
        let propname = attrName.replace(/^\.|^\[|\]$/g, '')
        let propName = attr2prop(node, propname)
        if(/^\./.test(attrName)) propName = `'${propName}'`
        code += `self.prop('${id}', ${propName}, function(){return ${attrValue}})\n`

        detectTemplateError(attrValue, attribute)
        removeAttribute(node, attrName)
        return
      }

      // attr="${}"
      if (/\$?\{[^]*?\}/.test(attrValue)) {
        const exp = parseExp(attrValue)
        code += `self.attr('${id}', '${attrName}', ${exp})\n`
        detectTemplateError(exp, node)
      }
    })

    // is

    // >>>
    loopNodeTree(node.childNodes)
    // <<<

    // end if
    if (_if_ || _else_) {
      code += '})\n'
    }

    // end for
    if (_for_) {
      code += '})\n'
    }
  }

  const render = Function(code)

  console.log(wrapper.outerHTML, wrapper, scriptCode, render)
  return wrapper
}

const html = `
\${1}
<ul title="\${2}" .prop="22" [key]="222" ...="{a:2222}">
  <li for="const item of list3" if="item!=3" is="MyComponent" .value="3" onclick="alert()" .oninput="console.log">
    \${4}
  </li>
</ul>
<script>
var a = 1
</script>
`

compile(html)
