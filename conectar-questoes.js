(() => {
  'use strict';

  const nomes = {
    estatuto: 'Legislação Institucional',
    cf: 'Direito Constitucional',
    portugues: 'Língua Portuguesa',
    especial: 'Legislação Especial',
    ctb: 'Legislação de Trânsito',
    cp: 'Direito Penal Comum',
    cpp: 'Direito Processual Penal',
    cpm: 'Direito Penal Militar',
    informatica: 'Informática'
  };

  const cacheKey = 'pmsc-questoes-conectadas-v4';

  const legado = DATA.quiz.map(
    (q, i) =>
      q.id || 'autoral-' + String(i + 1).padStart(4, '0')
  );

  DATA.quiz = DATA.quiz.map((q, i) => ({
    ...q,
    id: legado[i],
    subject: q.ref.split(':')[0],
    review: 'revisada'
  }));

  let mensagem = 'Buscando questoes.json…';
  let ocupado = false;

  const fonte = new URL('./questoes.json', document.baseURI);

  const materia = q =>
    nomes[q.subject] || LAW[q.subject]?.title || q.subject;

  const identificador = resposta =>
    resposta.qid || legado[resposta.q];

  function mostrar() {
    if (
      view === 'home' ||
      (view === 'quiz' && !quiz)
    ) {
      render();
    }
  }

  function validar(raw) {
    if (
      !raw ||
      raw.versao !== 1 ||
      !Array.isArray(raw.questoes) ||
      !raw.questoes.length ||
      raw.questoes.length > 20000
    ) {
      throw Error(
        'Formato inválido: esperado versao: 1 e lista questoes.'
      );
    }

    const ids = new Set();

    return raw.questoes.map((q, i) => {
      const numero = i + 1;

      if (
        !q ||
        typeof q.id !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(q.id) ||
        ids.has(q.id)
      ) {
        throw Error(
          'ID ausente, repetido ou inválido na questão ' + numero
        );
      }

      if (!nomes[q.materia] && !LAW[q.materia]) {
        throw Error(
          'Matéria desconhecida na questão ' + numero
        );
      }

      if (
        typeof q.enunciado !== 'string' ||
        !q.enunciado.trim() ||
        q.enunciado.length > 20000 ||
        !Array.isArray(q.alternativas) ||
        q.alternativas.length < 2 ||
        q.alternativas.length > 8 ||
        !q.alternativas.every(
          alternativa =>
            typeof alternativa === 'string' &&
            alternativa.trim() &&
            alternativa.length <= 10000
        )
      ) {
        throw Error(
          'Enunciado ou alternativas inválidos na questão ' +
          numero
        );
      }

      if (
        !Number.isInteger(q.gabarito) ||
        q.gabarito < 0 ||
        q.gabarito >= q.alternativas.length
      ) {
        throw Error(
          'Gabarito inválido na questão ' + numero
        );
      }

      if (
        typeof q.comentario !== 'string' ||
        q.comentario.length > 20000
      ) {
        throw Error(
          'Comentário inválido na questão ' + numero
        );
      }

      if (
        q.revisao !== undefined &&
        ![
          'revisada',
          'pendente',
          'problema_identificado'
        ].includes(q.revisao)
      ) {
        throw Error(
          'Revisão inválida na questão ' + numero
        );
      }

      for (const campo of ['anulada', 'desatualizada']) {
        if (
          q[campo] !== undefined &&
          typeof q[campo] !== 'boolean'
        ) {
          throw Error('Campo inválido: ' + campo);
        }
      }

      if (
        q.observacaoLegal !== undefined &&
        (
          typeof q.observacaoLegal !== 'string' ||
          q.observacaoLegal.length > 10000
        )
      ) {
        throw Error('Observação inválida.');
      }

      ids.add(q.id);

      const ref = q.artigo == null
        ? null
        : q.materia + ':' + q.artigo;

      if (ref && !ART[ref]) {
        throw Error(
          'Artigo inexistente na biblioteca: ' + ref
        );
      }

      return {
        id: q.id,
        ref,
        subject: q.materia,
        prompt: q.enunciado,
        choices: q.alternativas,
        answer: q.gabarito,
        why: q.comentario,
        review: q.revisao || 'pendente',
        blocked:
          q.anulada === true ||
          q.desatualizada === true,
        note: q.observacaoLegal || ''
      };
    });
  }

  function aplicar(raw, texto) {
    const lista = validar(raw);

    DATA.quiz = lista;

    const aptas = lista.filter(
      q => q.review === 'revisada' && !q.blocked
    ).length;

    mensagem =
      texto + ' ' +
      lista.length + ' questões; ' +
      aptas + ' aptas para pontuação.';

    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify(raw)
      );
    } catch {
      // O banco continua disponível nesta sessão.
    }

    mostrar();
  }

  async function carregar() {
    if (ocupado) return;

    ocupado = true;
    mensagem = 'Buscando questoes.json…';

    mostrar();

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      15000
    );

    try {
      if (location.protocol === 'file:') {
        throw Error(
          'Para carregar automaticamente, abra o site no ' +
          'GitHub Pages. No computador, use Importar JSON.'
        );
      }

      const response = await fetch(fonte, {
        cache: 'no-store',
        signal: controller.signal
      });

      if (!response.ok) {
        throw Error(
          'questoes.json não encontrado ' +
          '(HTTP ' + response.status + ').'
        );
      }

      const texto = await response.text();

      if (texto.length > 20000000) {
        throw Error('JSON maior que 20 MB.');
      }

      aplicar(
        JSON.parse(texto),
        'Banco externo carregado.'
      );
    } catch (erro) {
      const detalhe = erro.name === 'AbortError'
        ? 'O carregamento excedeu 15 segundos.'
        : erro.message;

      mensagem =
        detalhe +
        ' Mantido o banco disponível; ' +
        'seu progresso não foi apagado.';
    } finally {
      clearTimeout(timer);
      ocupado = false;
      mostrar();
    }
  }

  function escolherArquivo() {
    const seletor = document.createElement('input');

    seletor.type = 'file';
    seletor.accept = '.json,application/json';

    seletor.onchange = async () => {
      const arquivo = seletor.files[0];

      if (!arquivo) return;

      try {
        if (arquivo.size > 20000000) {
          throw Error('Arquivo maior que 20 MB.');
        }

        const raw = JSON.parse(await arquivo.text());

        aplicar(
          raw,
          'JSON importado neste navegador.'
        );
      } catch (erro) {
        mensagem =
          'Importação recusada: ' + erro.message;

        mostrar();
      }
    };

    seletor.click();
  }

  function filtrar() {
    const grupo =
      $('quizLaw')?.value || 'all';

    const somenteErros =
      $('wrongOnly')?.checked || false;

    const incluirPendentes =
      $('pmscPendentes')?.checked || false;

    return DATA.quiz.filter(q => {
      const mesmaMateria =
        grupo === 'all' ||
        q.subject === grupo;

      const correspondeAosErros =
        !somenteErros ||
        state.answers.some(
          resposta =>
            identificador(resposta) === q.id &&
            !resposta.correct
        );

      const podeEntrar =
        incluirPendentes ||
        (
          q.review === 'revisada' &&
          !q.blocked
        );

      return (
        mesmaMateria &&
        correspondeAosErros &&
        podeEntrar
      );
    });
  }

  startQuiz = function () {
    const quantidade = Number(
      $('pmscQuantidade')?.value || 10
    );

    quiz = {
      items: shuffle(filtrar()).slice(0, quantidade),
      pos: 0,
      selected: null,
      score: 0,
      graded: 0,
      results: []
    };

    render();
  };

  quizView = function () {
    if (!quiz) {
      const grupos = [
        ...new Set(
          DATA.quiz.map(q => q.subject)
        )
      ];

      const opcoesMaterias = grupos.map(grupo => {
        const titulo =
          nomes[grupo] ||
          LAW[grupo]?.title ||
          grupo;

        return `
          <option value="${grupo}">
            ${escapeHTML(titulo)}
          </option>
        `;
      }).join('');

      const opcoesQuantidades = [
        5, 10, 20, 30, 60
      ].map(numero => `
        <option
          value="${numero}"
          ${numero === 10 ? 'selected' : ''}
        >
          Até ${numero}
        </option>
      `).join('');

      return heading(
        'BANCO DE QUESTÕES',
        'Pratique por matéria.',
        'O arquivo questoes.json alimenta esta área. ' +
        'Os demais recursos do site permanecem disponíveis.'
      ) + `
        <div class="panel">
          <p role="status">
            ${escapeHTML(mensagem)}
          </p>

          <div class="actions">
            <button
              id="pmscAtualizar"
              ${ocupado ? 'disabled' : ''}
            >
              Atualizar banco
            </button>

            <button id="pmscImportar">
              Importar JSON
            </button>
          </div>
        </div>

        <div class="panel">
          <label>
            Matéria

            <select id="quizLaw">
              <option value="all">
                Todas as matérias
              </option>

              ${opcoesMaterias}
            </select>
          </label>

          <label>
            Questões por sessão

            <select id="pmscQuantidade">
              ${opcoesQuantidades}
            </select>
          </label>

          <label style="display:block;margin:16px 0">
            <input
              type="checkbox"
              id="wrongOnly"
            >
            Somente questões que já errei
          </label>

          <label style="display:block;margin:16px 0">
            <input
              type="checkbox"
              id="pmscPendentes"
            >
            Consultar também itens pendentes ou suspensos,
            sem pontuação
          </label>

          <button
            class="primary"
            id="startQuiz"
          >
            Iniciar prática →
          </button>
        </div>
      `;
    }

    if (!quiz.items.length) {
      return heading(
        'QUESTÕES',
        'Nenhuma questão nesse filtro.'
      ) + `
        <div class="panel">
          Escolha outra matéria ou confira
          o carregamento do JSON.

          <br>

          <button id="resetQuiz">
            Alterar filtro
          </button>
        </div>
      `;
    }

    if (quiz.pos >= quiz.items.length) {
      const resultados = quiz.results.map(resultado => {
        const situacao = resultado.excluded
          ? 'Sem pontuação'
          : resultado.correct
            ? '✓ Acertou'
            : '↻ Rever';

        return `
          <p>
            <strong>${situacao}</strong>
            ·
            ${escapeHTML(resultado.question.prompt)}
          </p>
        `;
      }).join('');

      return heading(
        'SESSÃO CONCLUÍDA',
        quiz.score + ' de ' +
        quiz.graded + ' acertos válidos.',
        'Itens pendentes ou suspensos ' +
        'não entram na pontuação.'
      ) + `
        <div class="panel">
          ${resultados}

          <button id="resetQuiz">
            Nova sessão
          </button>
        </div>
      `;
    }

    const q = quiz.items[quiz.pos];

    const suspenso =
      q.review !== 'revisada' ||
      q.blocked;

    const aviso = suspenso ? `
      <p class="notice">
        Item pendente ou suspenso.
        O gabarito informado não está
        validado para pontuação.
      </p>
    ` : '';

    const observacao = q.note ? `
      <p class="hint">
        ${escapeHTML(q.note)}
      </p>
    ` : '';

    const alternativas = q.choices.map(
      (alternativa, indice) => {
        const respondeu = quiz.selected !== null;

        const certa =
          respondeu &&
          !suspenso &&
          indice === q.answer;

        const errada =
          quiz.selected === indice &&
          !suspenso &&
          indice !== q.answer;

        return `
          <button
            class="
              quiz-option
              ${certa ? 'right' : ''}
              ${errada ? 'wrong' : ''}
            "
            data-choice="${indice}"
            ${respondeu ? 'disabled' : ''}
          >
            <strong>
              ${String.fromCharCode(65 + indice)}.
            </strong>

            ${escapeHTML(alternativa)}
          </button>
        `;
      }
    ).join('');

    let feedback = '';

    if (quiz.selected !== null) {
      const titulo = suspenso
        ? 'Comentário para revisão'
        : quiz.selected === q.answer
          ? '✓ Resposta correta'
          : 'Resposta a revisar';

      const artigo = q.ref ? `
        <button data-art="${q.ref}">
          Abrir artigo relacionado
        </button>
      ` : '';

      const proxima =
        quiz.pos + 1 === quiz.items.length
          ? 'Ver resultado'
          : 'Próxima questão →';

      feedback = `
        <div class="quiz-feedback">
          <strong>${titulo}</strong>

          <p style="white-space:pre-wrap">
            ${escapeHTML(q.why)}
          </p>

          ${artigo}
        </div>

        <button
          class="primary"
          id="nextQuiz"
        >
          ${proxima}
        </button>
      `;
    }

    return heading(
      'PRÁTICA COMENTADA',
      'Questão ' + (quiz.pos + 1) +
      ' de ' + quiz.items.length,
      materia(q)
    ) + `
      <div class="panel">
        ${aviso}
        ${observacao}

        <h3 style="line-height:1.6;white-space:pre-wrap">
          ${escapeHTML(q.prompt)}
        </h3>

        ${alternativas}
        ${feedback}
      </div>
    `;
  };

  document.addEventListener('click', evento => {
    const botao = evento.target.closest('button');

    if (!botao || botao.disabled) return;

    if (botao.id === 'pmscAtualizar') {
      evento.stopImmediatePropagation();
      carregar();
      return;
    }

    if (botao.id === 'pmscImportar') {
      evento.stopImmediatePropagation();
      escolherArquivo();
      return;
    }

    if (
      botao.dataset.choice !== undefined &&
      quiz?.items
    ) {
      evento.stopImmediatePropagation();

      if (quiz.selected !== null) return;

      const q = quiz.items[quiz.pos];
      const indice = Number(botao.dataset.choice);

      if (
        !Number.isInteger(indice) ||
        indice < 0 ||
        indice >= q.choices.length
      ) {
        return;
      }

      const correct = indice === q.answer;

      const excluded =
        q.review !== 'revisada' ||
        q.blocked;

      quiz.selected = indice;

      quiz.results.push({
        question: q,
        correct,
        excluded
      });

      if (!excluded) {
        quiz.graded++;

        if (correct) {
          quiz.score++;
        }

        state.answers.push({
          qid: q.id,
          correct,
          date: TODAY()
        });

        state.answers =
          state.answers.slice(-5000);

        save();
      }

      render();
      return;
    }

    if (
      botao.id === 'nextQuiz' &&
      quiz?.items
    ) {
      evento.stopImmediatePropagation();

      quiz.pos++;
      quiz.selected = null;

      render();
    }
  }, true);

  const homeOriginal = home;

  home = function () {
    return homeOriginal().replaceAll(
      'questões autorais',
      'questões no banco'
    );
  };

  try {
    const salvo = JSON.parse(
      localStorage.getItem(cacheKey) || 'null'
    );

    if (salvo) {
      aplicar(
        salvo,
        'Último banco válido recuperado.'
      );
    }
  } catch {
    // Um cache inválido não substitui o banco disponível.
  }

  render();
  carregar();
})();
